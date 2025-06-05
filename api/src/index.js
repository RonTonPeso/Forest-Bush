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

// Get a feature flag by key
app.get('/flags/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    // Return the flag data; client-side will handle rules if necessary for this basic version
    // For now, just check 'enabled' status as per instructions
    if (flag.enabled) {
      return res.json(flag);
    } else {
      // Return the flag object even if not enabled, but with a clear status or message
      return res.status(200).json({ message: 'Flag is not currently enabled', enabled: flag.enabled, key: flag.key, flag });
    }

  } catch (error) {
    console.error(`Error fetching flag '${key}':`, error);
    res.status(500).json({ error: 'Internal server error while fetching the flag' });
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