require('dotenv').config();

// early startup logging
console.log('application starting...');
console.log(`database_url set: ${!!process.env.DATABASE_URL}`);
if (process.env.DATABASE_URL) {
    try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        console.log(`database_url host: ${dbUrl.hostname}, user: ${dbUrl.username}`);
    } catch (e) {
        console.error('failed to parse database_url for logging:', e.message);
    }
}
console.log(`redis_url set: ${!!process.env.REDIS_URL}`);
if (process.env.REDIS_URL) {
    try {
        const rUrl = new URL(process.env.REDIS_URL);
        console.log(`redis_url host: ${rUrl.hostname}`);
    } catch (e) {
        console.error('failed to parse redis_url for logging:', e.message);
    }
}

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');

const redis = require('./lib/redis'); // use shared redis client
const adminFlagsRouter = require('./routes/adminFlags');

const app = express();
let prisma;
try {
  console.log('initializing prismaclient...');
  prisma = new PrismaClient();
  prisma.$connect().then(() => {
    console.log('prismaclient initialized successfully.');
  }).catch(err => {
    console.error('prisma connection error:', err);
  });
} catch (error) {
  console.error('failed to initialize prismaclient:', error);
  process.exit(1); // critical failure, exit
}

const PORT = process.env.PORT || 8080;

// middleware
app.use(cors()); 
app.use(helmet()); 
app.use(morgan('dev')); 
app.use(express.json()); 

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// Detailed health check (existing)
app.get('/healthz', async (req, res) => {
  try {
    // Check Postgres with Prisma
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    const pong = await redis.ping();

    return res.json({
      status: 'ok',
      postgres: 'connected',
      redis: pong
    });
  } catch (error) {
    console.error('Healthz check failed:', error);
    return res.status(500).json({ 
      status: 'error', 
      error: error.message,
      details: {
        postgres: error.message.toLowerCase().includes('database') || error.message.toLowerCase().includes('prisma') ? 'error' : 'unknown',
        redis: error.message.toLowerCase().includes('redis') ? 'error' : 'unknown',
      }
    });
  }
});

// the primary public-facing endpoint for evaluating a flag
app.get('/flags/:key', async (req, res) => {
  const { key } = req.params;
  const { userId } = req.query;

  const cacheKey = `flag:${key}:${userId || 'anonymous'}`;

  try {
    // --- cache check ---
    let cachedResult = null;
    try {
      if (redis.status === 'ready') {
        cachedResult = await redis.get(cacheKey);
        if (cachedResult) {
          console.log(`[cache hit] for key: ${cacheKey}`);
          return res.status(200).json(JSON.parse(cachedResult));
        }
      }
    } catch (cacheError) {
      console.warn(`cache read failed for ${cacheKey}:`, cacheError.message);
    }
    console.log(`[cache miss] for key: ${cacheKey}`);

    const flag = await prisma.featureFlag.findUnique({
      where: { key },
    });

    let result;

    if (!flag) {
      result = { key, enabled: false, reason: 'not_found' };
    } else if (!flag.enabled) {
      result = { key, enabled: false, reason: 'disabled' };
    } else if (!flag.rules || Object.keys(flag.rules).length === 0) {
      result = { key, enabled: true, reason: 'enabled' };
    } else {
      // --- rule evaluation logic ---
      const { rolloutPercentage } = flag.rules;
      if (rolloutPercentage !== undefined) {
        let hashValue;
        if (userId) {
          const hash = crypto.createHash('sha256').update(`${key}:${userId}`).digest('hex');
          hashValue = parseInt(hash.substring(0, 8), 16) % 100;
        } else {
          hashValue = Math.floor(Math.random() * 100);
        }
        
        if (hashValue < rolloutPercentage) {
          result = { key, enabled: true, reason: 'rollout' };
        } else {
          result = { key, enabled: false, reason: 'rollout' };
        }
      } else {
        // default to enabled if rules exist but aren't recognized
        result = { key, enabled: true, reason: 'enabled' };
      }
    }

    // --- set cache ---
    try {
      if (redis.status === 'ready') {
        // cache the result for 60 seconds
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
      }
    } catch (cacheError) {
      console.warn(`cache write failed for ${cacheKey}:`, cacheError.message);
    }
    return res.status(200).json(result);

  } catch (error) {
    console.error(`error evaluating flag '${key}':`, error);
    res.status(200).json({ key, enabled: false, reason: 'error' });
  }
});

// admin routes
app.use('/admin/flags', adminFlagsRouter); // use admin flags router

const server = app.listen(PORT, () => {
  console.log(`Forest Bush API listening on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`${signal} signal received: closing HTTP server`);
  console.log('shutting down...');
  server.close(async () => {
    console.log('http server closed.');
    await prisma.$disconnect();
    console.log('prisma client disconnected.');
    redis.quit(); // use quit for graceful shutdown
    console.log('redis client disconnected.');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); 