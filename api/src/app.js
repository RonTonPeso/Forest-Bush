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

// Evaluation reason taxonomy. The SDK mirrors these in sdk-js/src/index.ts;
// keep the two in sync.
const REASONS = {
  FLAG_NOT_FOUND: 'flag_not_found',
  DISABLED: 'disabled',
  ENABLED_NO_RULES: 'enabled_no_rules',
  CONTEXT_REQUIRED: 'context_required',
  ROLLOUT_MATCH: 'rollout_match',
  ROLLOUT_MISS: 'rollout_miss',
  ERROR: 'error',
};

// Stable 0-99 bucket for a flag/userId pair. Used for percentage rollouts; the
// SDK replicates this hashing so local and remote evaluation agree.
const rolloutBucket = (key, userId) => {
  const hash = crypto.createHash('sha256').update(`${key}:${userId}`).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 100;
};

// Returns { key, enabled, reason, trace }. The trace is always computed but only
// surfaced by the handler when ?explain=true is requested.
const evaluateFlag = ({ flag, key, userId, environment }) => {
  const trace = {
    environment: environment ?? null,
    flagFound: Boolean(flag),
    flagEnabled: Boolean(flag?.enabled),
    rule: 'none',
    rolloutPercentage: null,
    userId: userId ?? null,
    bucket: null,
  };

  if (!flag) {
    return { key, enabled: false, reason: REASONS.FLAG_NOT_FOUND, trace };
  }

  if (!flag.enabled) {
    return { key, enabled: false, reason: REASONS.DISABLED, trace };
  }

  const rolloutPercentage = flag.rules ? flag.rules.rolloutPercentage : undefined;

  if (!flag.rules || Object.keys(flag.rules).length === 0 || rolloutPercentage === undefined) {
    return { key, enabled: true, reason: REASONS.ENABLED_NO_RULES, trace };
  }

  trace.rule = 'rolloutPercentage';
  trace.rolloutPercentage = rolloutPercentage;

  if (!userId) {
    return { key, enabled: false, reason: REASONS.CONTEXT_REQUIRED, trace };
  }

  const bucket = rolloutBucket(key, userId);
  trace.bucket = bucket;
  const enabled = bucket < rolloutPercentage;

  return {
    key,
    enabled,
    reason: enabled ? REASONS.ROLLOUT_MATCH : REASONS.ROLLOUT_MISS,
    trace,
  };
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
    const explain = req.query.explain === 'true';
    const environmentResult = parseEnvironment(req.query.environment);

    if (!environmentResult.success) {
      return res.status(400).json({ message: environmentResult.error });
    }

    const { environment } = environmentResult;

    try {
      const version = await getFlagVersion(redis, key, environment, logger);
      const cacheKey = `flag:${environment}:${key}:v${version}:${userId || 'anonymous'}`;

      // Explain is a low-volume admin/debug path. Bypass the cache so the hot
      // path and its cached lean entries stay unchanged.
      if (!explain) {
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
      }

      const flag = await prisma.featureFlag.findUnique({
        where: {
          key_environment: {
            key,
            environment,
          },
        },
      });

      const { trace, ...result } = evaluateFlag({ flag, key, userId, environment });

      if (!explain) {
        try {
          if (!redis?.disabled && redis.status === 'ready') {
            await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
          }
        } catch (cacheError) {
          logger.warn(`cache write failed for ${cacheKey}:`, cacheError.message);
        }
      }

      return res.status(200).json(explain ? { ...result, trace } : result);
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

module.exports = { createApp, evaluateFlag, getFlagVersion, buildSnapshot, REASONS };
