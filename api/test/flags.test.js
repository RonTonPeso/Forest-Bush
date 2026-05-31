const { execFileSync } = require('child_process');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');

const { createApp } = require('../src/app');
const { createInMemoryRedisClient, createNoopRedisClient } = require('../src/lib/redis');

const ADMIN_API_KEY = 'test-admin-key';

const quietLogger = {
  log() {},
  warn() {},
  error() {},
};

const createTestServer = (redis = createInMemoryRedisClient()) => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.TEST_DATABASE_URL,
      },
    },
  });

  const app = createApp({
    prisma,
    redis,
    adminApiKey: ADMIN_API_KEY,
    logger: quietLogger,
  });

  return { app, prisma, redis };
};

beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required to run API integration tests.');
  }

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: __dirname + '/..',
    env: process.env,
    stdio: 'pipe',
  });
});

describe('flag evaluation', () => {
  let app;
  let prisma;
  let redis;

  beforeEach(async () => {
    ({ app, prisma, redis } = createTestServer());
    await prisma.featureFlag.deleteMany();
    redis.clear();
  });

  afterEach(async () => {
    await prisma.$disconnect();
    redis.quit();
  });

  it('returns not_found for a missing flag', async () => {
    const response = await request(app).get('/flags/missing-flag').expect(200);

    expect(response.body).toEqual({
      key: 'missing-flag',
      enabled: false,
      reason: 'not_found',
    });
  });

  it('returns disabled for a disabled flag', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'disabled-flag',
        enabled: false,
        rules: {},
      },
    });

    const response = await request(app).get('/flags/disabled-flag?userId=user-1').expect(200);

    expect(response.body).toEqual({
      key: 'disabled-flag',
      enabled: false,
      reason: 'disabled',
    });
  });

  it('returns enabled for an enabled flag without rules', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'plain-enabled',
        enabled: true,
        rules: {},
      },
    });

    const response = await request(app).get('/flags/plain-enabled').expect(200);

    expect(response.body).toEqual({
      key: 'plain-enabled',
      enabled: true,
      reason: 'enabled',
    });
  });

  it('evaluates rolloutPercentage 0 and 100 deterministically', async () => {
    await prisma.featureFlag.createMany({
      data: [
        {
          key: 'rollout-zero',
          enabled: true,
          rules: { rolloutPercentage: 0 },
        },
        {
          key: 'rollout-hundred',
          enabled: true,
          rules: { rolloutPercentage: 100 },
        },
      ],
    });

    const zero = await request(app).get('/flags/rollout-zero?userId=user-1').expect(200);
    const hundred = await request(app).get('/flags/rollout-hundred?userId=user-1').expect(200);

    expect(zero.body).toEqual({
      key: 'rollout-zero',
      enabled: false,
      reason: 'rollout',
    });
    expect(hundred.body).toEqual({
      key: 'rollout-hundred',
      enabled: true,
      reason: 'rollout',
    });
  });

  it('keeps percentage rollout sticky for the same userId', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'rollout-half',
        enabled: true,
        rules: { rolloutPercentage: 50 },
      },
    });

    const first = await request(app).get('/flags/rollout-half?userId=user-123').expect(200);
    const second = await request(app).get('/flags/rollout-half?userId=user-123').expect(200);

    expect(second.body).toEqual(first.body);
    expect(first.body.reason).toBe('rollout');
  });

  it('requires userId for percentage rollout', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'contextual-rollout',
        enabled: true,
        rules: { rolloutPercentage: 50 },
      },
    });

    const response = await request(app).get('/flags/contextual-rollout').expect(200);

    expect(response.body).toEqual({
      key: 'contextual-rollout',
      enabled: false,
      reason: 'context_required',
    });
  });

  it('uses versioned cache keys after an admin update', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'cached-flag',
        enabled: true,
        rules: {},
      },
    });

    const before = await request(app).get('/flags/cached-flag?userId=user-1').expect(200);
    expect(before.body.enabled).toBe(true);

    await request(app)
      .put('/admin/flags/cached-flag')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ enabled: false })
      .expect(200);

    const after = await request(app).get('/flags/cached-flag?userId=user-1').expect(200);
    expect(after.body).toEqual({
      key: 'cached-flag',
      enabled: false,
      reason: 'disabled',
    });
  });
});

describe('admin flag routes', () => {
  let app;
  let prisma;
  let redis;

  beforeEach(async () => {
    ({ app, prisma, redis } = createTestServer());
    await prisma.featureFlag.deleteMany();
    redis.clear();
  });

  afterEach(async () => {
    await prisma.$disconnect();
    redis.quit();
  });

  it('requires x-api-key for admin routes', async () => {
    await request(app).get('/admin/flags').expect(401);
    await request(app).get('/admin/flags').set('x-api-key', 'wrong-key').expect(403);
  });

  it('creates a flag with nested rollout rules', async () => {
    const response = await request(app)
      .post('/admin/flags')
      .set('x-api-key', ADMIN_API_KEY)
      .send({
        key: 'new-rollout',
        description: 'rollout test',
        enabled: true,
        rules: { rolloutPercentage: 25 },
      })
      .expect(201);

    expect(response.body.rules).toEqual({ rolloutPercentage: 25 });
  });

  it('rejects invalid rollout values on update', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'invalid-rollout',
        enabled: true,
        rules: {},
      },
    });

    await request(app)
      .put('/admin/flags/invalid-rollout')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ rules: { rolloutPercentage: 101 } })
      .expect(400);
  });
});

describe('redis disabled mode', () => {
  let app;
  let prisma;
  let redis;

  beforeEach(async () => {
    ({ app, prisma, redis } = createTestServer(createNoopRedisClient()));
    await prisma.featureFlag.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
    redis.quit();
  });

  it('keeps healthz healthy when Redis is disabled', async () => {
    const response = await request(app).get('/healthz').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      postgres: 'connected',
      redis: 'disabled',
    });
  });

  it('evaluates flags without Redis', async () => {
    await prisma.featureFlag.create({
      data: {
        key: 'no-redis',
        enabled: true,
        rules: {},
      },
    });

    const response = await request(app).get('/flags/no-redis').expect(200);

    expect(response.body).toEqual({
      key: 'no-redis',
      enabled: true,
      reason: 'enabled',
    });
  });
});
