require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Verify REDIS_URL exist (DATABASE_URL will be used by Prisma)
const redisUrl = process.env.REDIS_URL;

// Basic Redis client
const redis = new Redis(redisUrl, { tls: {} });

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