require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 8080;

// Verify DATABASE_URL and REDIS_URL exist
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

// Basic Postgres client (no pool for demo)
const pgClient = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

// Basic Redis client
const redis = new Redis(redisUrl, { tls: {} });

app.get('/healthz', async (req, res) => {
  try {
    // Check Postgres
    // Ensure pgClient.connect() is called only once or handled appropriately if called multiple times
    // For a simple health check, connecting and ending per request is fine but not for production apps.
    if (!pgClient._connected) { // Crude check, pg client state management is more complex
        await pgClient.connect();
    }
    const pgResult = await pgClient.query('SELECT NOW()');
    // Consider not ending the connection if you plan to reuse it or use a connection pool.
    // await pgClient.end(); 

    // Check Redis
    const pong = await redis.ping();
    // Consider not quitting the redis connection if you plan to reuse it.
    // await redis.quit(); 

    return res.json({
      status: 'ok',
      postgres_time: pgResult.rows[0].now,
      redis: pong
    });
  } catch (error) {
    // Ensure connections are cleaned up on error too
    // if (pgClient._connected) await pgClient.end();
    // if (redis.status === 'ready' || redis.status === 'connecting') await redis.quit(); 
    return res.status(500).json({ status: 'error', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Forest Bush API listening on port ${PORT}`);
});

// Graceful shutdown: Ensure database and Redis connections are closed when the app exits.
// This is important for preventing resource leaks.
process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server')
  if (pgClient && pgClient._connected) {
    await pgClient.end();
    console.log('PostgreSQL client disconnected');
  }
  if (redis && (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'connected')) {
    await redis.quit();
    console.log('Redis client disconnected');
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server')
  if (pgClient && pgClient._connected) {
    await pgClient.end();
    console.log('PostgreSQL client disconnected');
  }
  if (redis && (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'connected')) {
    await redis.quit();
    console.log('Redis client disconnected');
  }
  process.exit(0)
}) 