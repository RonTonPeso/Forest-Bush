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
const Redis = require('ioredis');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const adminFlagsRouter = require('./routes/adminFlags'); // import admin flags router
const crypto = require('crypto');

const app = express();
let prisma;
try {
  console.log('initializing prismaclient...');
  prisma = new PrismaClient();
  console.log('prismaclient initialized successfully.');
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

const redisUrl = process.env.REDIS_URL;
let redis;
if (redisUrl) {
  try {
    console.log('initializing redis client...');
    redis = new Redis(redisUrl, { 
        tls: {}, 
        // adding connection timeout to see if it helps with debugging hangs
        connectTimeout: 10000, // 10 seconds
        // adding a ready check for more explicit logging
        enableReadyCheck: true 
    });
    console.log('redis client initialization started.');

    redis.on('connect', () => {
        console.log('redis client connected.');
    });
    redis.on('ready', () => {
        console.log('redis client ready.');
    });
    redis.on('error', (err) => {
        console.error('redis client error:', err);
        // depending on the error, you might want to consider if it's fatal
        // for now, just logging. if it's a connection error at startup, the /healthz will fail.
    });

  } catch (error) {
    console.error('failed to initialize redis client:', error);
    // decide if this is a fatal error. for now, app will continue but /healthz will likely fail.
  }
} else {
  console.warn('redis_url not set. redis client not initialized.');
}

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
  const { userId } = req.query; // allow passing a userId for consistent evaluation

  try {
    // for now, we fetch directly from db. we add caching later.
    const flag = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!flag) {
      return res.status(200).json({ key, enabled: false, reason: 'not_found' });
    }

    // if the flag is globally disabled, it's always off.
    if (!flag.enabled) {
      return res.status(200).json({ key, enabled: false, reason: 'disabled' });
    }

    // if there are no specific rules, and it's enabled, it's on for everyone.
    if (!flag.rules || Object.keys(flag.rules).length === 0) {
      return res.status(200).json({ key, enabled: true, reason: 'enabled' });
    }
    
    // --- rule evaluation logic ---
    const { rolloutPercentage } = flag.rules;

    if (rolloutPercentage !== undefined) {
      let hashValue;
      // if a userId is provided, use it for a consistent hash.
      // otherwise, the rollout is not "sticky" and will be random for each call.
      if (userId) {
        const hash = crypto.createHash('sha256').update(`${key}:${userId}`).digest('hex');
        hashValue = parseInt(hash.substring(0, 8), 16) % 100; // get a value from 0-99
      } else {
        hashValue = Math.floor(Math.random() * 100); // 0-99
      }
      
      if (hashValue < rolloutPercentage) {
        return res.status(200).json({ key, enabled: true, reason: 'rollout' });
      } else {
        return res.status(200).json({ key, enabled: false, reason: 'rollout' });
      }
    }

    // if rules exist but don't match a known evaluation, default to enabled
    return res.status(200).json({ key, enabled: true, reason: 'enabled' });

  } catch (error) {
    console.error(`error evaluating flag '${key}':`, error);
    // for public endpoint, don't leak server errors. just return a default value.
    res.status(200).json({ key, enabled: false, reason: 'error' });
  }
});

// admin routes
app.use('/admin/flags', adminFlagsRouter); // use admin flags router

app.listen(PORT, () => {
  console.log(`Forest Bush API listening on port ${PORT}`);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`${signal} signal received: closing HTTP server`);
  // Add any other cleanup tasks here, like closing the HTTP server itself if needed
  // server.close(() => { ... });

  try {
    await prisma.$disconnect();
    console.log('Prisma client disconnected');
  } catch (e) {
    console.error('Error disconnecting Prisma client', e);
  }

  if (redis && (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'connected')) {
    try {
      await redis.quit();
      console.log('Redis client disconnected');
    } catch (e) {
      console.error('Error disconnecting Redis client', e);
    }
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); 