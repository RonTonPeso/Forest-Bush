const Redis = require('ioredis');

const createNoopRedisClient = () => ({
  status: 'disabled',
  disabled: true,
  async get() {
    return null;
  },
  async set() {
    return 'OK';
  },
  async del() {
    return 0;
  },
  async incr() {
    return 0;
  },
  async ping() {
    return 'disabled';
  },
  quit() {},
});

const createInMemoryRedisClient = () => {
  const store = new Map();

  const isExpired = (entry) => entry.expiresAt !== null && Date.now() > entry.expiresAt;

  return {
    status: 'ready',
    disabled: false,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, mode, ttlSeconds) {
      const expiresAt = mode === 'EX' && ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
      store.set(key, { value, expiresAt });
      return 'OK';
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async incr(key) {
      const current = Number(await this.get(key)) || 0;
      const next = current + 1;
      store.set(key, { value: String(next), expiresAt: null });
      return next;
    },
    async ping() {
      return 'PONG';
    },
    quit() {
      store.clear();
    },
    clear() {
      store.clear();
    },
  };
};

const createRedisClient = ({ redisUrl = process.env.REDIS_URL, logger = console } = {}) => {
  if (!redisUrl) {
    logger.warn('REDIS_URL is not set. Redis caching is disabled.');
    return createNoopRedisClient();
  }

  logger.log('initializing shared redis client...');

  const redis = new Redis(redisUrl, {
    tls: {
      rejectUnauthorized: false,
    },
    maxRetriesPerRequest: 5,
  });

  redis.on('connect', () => {
    logger.log('shared redis client connected.');
  });

  redis.on('error', (err) => {
    logger.error('shared redis client error:', err);
  });

  return redis;
};

module.exports = {
  createRedisClient,
  createNoopRedisClient,
  createInMemoryRedisClient,
};
