require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./app');
const { createRedisClient } = require('./lib/redis');

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

const PORT = process.env.PORT || 8080;

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
  process.exit(1);
}

const redis = createRedisClient();
const app = createApp({
  prisma,
  redis,
  adminApiKey: process.env.ADMIN_API_KEY,
});

const server = app.listen(PORT, () => {
  console.log(`Forest Bush API listening on port ${PORT}`);
});

const gracefulShutdown = (signal) => {
  console.log(`${signal} signal received: closing HTTP server`);
  console.log('shutting down...');
  server.close(async () => {
    console.log('http server closed.');
    await prisma.$disconnect();
    console.log('prisma client disconnected.');
    redis.quit();
    console.log('redis client disconnected.');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
