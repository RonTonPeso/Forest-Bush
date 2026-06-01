const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');

const { createAdminFlagsRouter } = require('./routes/adminFlags');
const { DEFAULT_ENVIRONMENT, parseEnvironment } = require('./schemas/flagSchemas');

const getFlagVersion = async (redis, key, environment = DEFAULT_ENVIRONMENT, logger = console) => {
  if (redis?.disabled) return '0';

  try {
    return (await redis.get(`flag-version:${environment}:${key}`)) || '0';
  } catch (error) {
    logger.warn(`cache version read failed for flag '${environment}/${key}':`, error.message);
    return '0';
  }
};

// Environment-level version counter, bumped on any admin mutation so cached
// snapshots invalidate. Mirrors getFlagVersion but scoped to the whole env.
const getEnvironmentVersion = async (redis, environment, logger = console) => {
  if (redis?.disabled) return '0';

  try {
    return (await redis.get(`env-version:${environment}`)) || '0';
  } catch (error) {
    logger.warn(`env version read failed for '${environment}':`, error.message);
    return '0';
  }
};

// Builds a deterministic snapshot of every flag in an environment. The flag
// list is projected and sorted by key so the checksum is stable across calls;
// version is a short prefix of that checksum. generatedAt is informational and
// does not affect the checksum.
const buildSnapshot = (flags, environment) => {
  const projected = flags
    .map((flag) => ({ key: flag.key, enabled: flag.enabled, rules: flag.rules ?? null }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const checksum = crypto.createHash('sha256').update(JSON.stringify(projected)).digest('hex');

  return {
    environment,
    version: checksum.substring(0, 12),
    generatedAt: new Date().toISOString(),
    checksum,
    flags: projected,
  };
};

const evaluateFlag = ({ flag, key, userId }) => {
  if (!flag) {
    return { key, enabled: false, reason: 'not_found' };
  }

  if (!flag.enabled) {
    return { key, enabled: false, reason: 'disabled' };
  }

  if (!flag.rules || Object.keys(flag.rules).length === 0) {
    return { key, enabled: true, reason: 'enabled' };
  }

  const { rolloutPercentage } = flag.rules;

  if (rolloutPercentage !== undefined) {
    if (!userId) {
      return { key, enabled: false, reason: 'context_required' };
    }

    const hash = crypto.createHash('sha256').update(`${key}:${userId}`).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16) % 100;

    return { key, enabled: hashValue < rolloutPercentage, reason: 'rollout' };
  }

  return { key, enabled: true, reason: 'enabled' };
};

const createApp = ({ prisma, redis, adminApiKey, logger = console } = {}) => {
  if (!prisma) {
    throw new Error('createApp requires a prisma client');
  }

  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/healthz', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      if (redis?.disabled) {
        return res.json({
          status: 'ok',
          postgres: 'connected',
          redis: 'disabled',
        });
      }

      const pong = await redis.ping();

      return res.json({
        status: 'ok',
        postgres: 'connected',
        redis: pong,
      });
    } catch (error) {
      logger.error('Healthz check failed:', error);
      return res.status(500).json({
        status: 'error',
        error: error.message,
        details: {
          postgres: error.message.toLowerCase().includes('database') || error.message.toLowerCase().includes('prisma') ? 'error' : 'unknown',
          redis: error.message.toLowerCase().includes('redis') ? 'error' : 'unknown',
        },
      });
    }
  });

  app.get('/flags/:key', async (req, res) => {
    const { key } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const environmentResult = parseEnvironment(req.query.environment);

    if (!environmentResult.success) {
      return res.status(400).json({ message: environmentResult.error });
    }

    const { environment } = environmentResult;

    try {
      const version = await getFlagVersion(redis, key, environment, logger);
      const cacheKey = `flag:${environment}:${key}:v${version}:${userId || 'anonymous'}`;

      try {
        if (!redis?.disabled && redis.status === 'ready') {
          const cachedResult = await redis.get(cacheKey);
          if (cachedResult) {
            logger.log(`[cache hit] for key: ${cacheKey}`);
            return res.status(200).json(JSON.parse(cachedResult));
          }
        }
      } catch (cacheError) {
        logger.warn(`cache read failed for ${cacheKey}:`, cacheError.message);
      }
      logger.log(`[cache miss] for key: ${cacheKey}`);

      const flag = await prisma.featureFlag.findUnique({
        where: {
          key_environment: {
            key,
            environment,
          },
        },
      });

      const result = evaluateFlag({ flag, key, userId });

      try {
        if (!redis?.disabled && redis.status === 'ready') {
          await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
        }
      } catch (cacheError) {
        logger.warn(`cache write failed for ${cacheKey}:`, cacheError.message);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`error evaluating flag '${key}':`, error);
      return res.status(200).json({ key, enabled: false, reason: 'error' });
    }
  });

  // Returns a versioned snapshot of all flags in an environment so SDKs can
  // evaluate locally instead of one HTTP request per flag.
  app.get('/environments/:envKey/snapshot', async (req, res) => {
    const environmentResult = parseEnvironment(req.params.envKey);

    if (!environmentResult.success) {
      return res.status(400).json({ message: environmentResult.error });
    }

    const { environment } = environmentResult;

    try {
      const version = await getEnvironmentVersion(redis, environment, logger);
      const cacheKey = `snapshot:${environment}:v${version}`;

      try {
        if (!redis?.disabled && redis.status === 'ready') {
          const cached = await redis.get(cacheKey);
          if (cached) {
            return res.status(200).json(JSON.parse(cached));
          }
        }
      } catch (cacheError) {
        logger.warn(`snapshot cache read failed for ${cacheKey}:`, cacheError.message);
      }

      const flags = await prisma.featureFlag.findMany({ where: { environment } });
      const snapshot = buildSnapshot(flags, environment);

      try {
        if (!redis?.disabled && redis.status === 'ready') {
          await redis.set(cacheKey, JSON.stringify(snapshot), 'EX', 60);
        }
      } catch (cacheError) {
        logger.warn(`snapshot cache write failed for ${cacheKey}:`, cacheError.message);
      }

      return res.status(200).json(snapshot);
    } catch (error) {
      logger.error(`error building snapshot for '${environment}':`, error);
      return res.status(500).json({ message: 'error building snapshot' });
    }
  });

  app.use('/admin/flags', createAdminFlagsRouter({ prisma, redis, adminApiKey, logger }));

  return app;
};

module.exports = { createApp, evaluateFlag, getFlagVersion, buildSnapshot };
