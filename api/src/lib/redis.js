const Redis = require('ioredis');

console.log('initializing shared redis client...');

const redis = new Redis(process.env.REDIS_URL, {
  // tls option is needed for upstash redis
  tls: {
    rejectUnauthorized: false,
  },
  // keep the client alive, but don't wait forever on connection issues
  maxRetriesPerRequest: 5, 
});

redis.on('connect', () => {
  console.log('shared redis client connected.');
});

redis.on('error', (err) => {
  console.error('shared redis client error:', err);
});

module.exports = redis; 