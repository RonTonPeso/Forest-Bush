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
    await prisma.auditEvent.deleteMany();
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
      reason: 'flag_not_found',
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
      reason: 'enabled_no_rules',
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
      reason: 'rollout_miss',
    });
    expect(hundred.body).toEqual({
      key: 'rollout-hundred',
      enabled: true,
      reason: 'rollout_match',
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
    expect(['rollout_match', 'rollout_miss']).toContain(first.body.reason);
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

  it('evaluates the requested environment and defaults to production', async () => {
    await prisma.featureFlag.createMany({
      data: [
        {
          key: 'environmental-flag',
          environment: 'production',
          enabled: false,
          rules: {},
        },
        {
          key: 'environmental-flag',
          environment: 'staging',
          enabled: true,
          rules: {},
        },
      ],
    });

    const production = await request(app).get('/flags/environmental-flag').expect(200);
    const staging = await request(app).get('/flags/environmental-flag?environment=staging').expect(200);

    expect(production.body).toEqual({
      key: 'environmental-flag',
      enabled: false,
      reason: 'disabled',
    });
    expect(staging.body).toEqual({
      key: 'environmental-flag',
      enabled: true,
      reason: 'enabled_no_rules',
    });
  });

  it('rejects invalid public evaluation environments', async () => {
    await request(app).get('/flags/any-flag?environment=qa').expect(400);
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

  it('keeps cache versions isolated by environment', async () => {
    await prisma.featureFlag.createMany({
      data: [
        {
          key: 'cached-by-environment',
          environment: 'production',
          enabled: true,
          rules: {},
        },
        {
          key: 'cached-by-environment',
          environment: 'staging',
          enabled: true,
          rules: {},
        },
      ],
    });

    await request(app).get('/flags/cached-by-environment?environment=production&userId=user-1').expect(200);
    await request(app).get('/flags/cached-by-environment?environment=staging&userId=user-1').expect(200);

    await request(app)
      .put('/admin/flags/cached-by-environment?environment=staging')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ enabled: false })
      .expect(200);

    const production = await request(app)
      .get('/flags/cached-by-environment?environment=production&userId=user-1')
      .expect(200);
    const staging = await request(app)
      .get('/flags/cached-by-environment?environment=staging&userId=user-1')
      .expect(200);

    expect(production.body).toEqual({
      key: 'cached-by-environment',
      enabled: true,
      reason: 'enabled_no_rules',
    });
    expect(staging.body).toEqual({
      key: 'cached-by-environment',
      enabled: false,
      reason: 'disabled',
    });
  });

  it('omits the trace unless explain is requested', async () => {
    await prisma.featureFlag.create({
      data: { key: 'lean-flag', enabled: true, rules: {} },
    });

    const response = await request(app).get('/flags/lean-flag').expect(200);

    expect(response.body).toEqual({
      key: 'lean-flag',
      enabled: true,
      reason: 'enabled_no_rules',
    });
    expect(response.body.trace).toBeUndefined();
  });

  it('returns a trace for a rollout match when explain=true', async () => {
    await prisma.featureFlag.create({
      data: { key: 'explained-rollout', enabled: true, rules: { rolloutPercentage: 100 } },
    });

    const response = await request(app)
      .get('/flags/explained-rollout?environment=production&userId=user-1&explain=true')
      .expect(200);

    expect(response.body.enabled).toBe(true);
    expect(response.body.reason).toBe('rollout_match');
    expect(response.body.trace).toMatchObject({
      environment: 'production',
      flagFound: true,
      flagEnabled: true,
      rule: 'rolloutPercentage',
      rolloutPercentage: 100,
      userId: 'user-1',
    });
    expect(response.body.trace.bucket).toBeGreaterThanOrEqual(0);
    expect(response.body.trace.bucket).toBeLessThan(100);
  });

  it('explains a context_required result for an anonymous rollout', async () => {
    await prisma.featureFlag.create({
      data: { key: 'explained-context', enabled: true, rules: { rolloutPercentage: 50 } },
    });

    const response = await request(app)
      .get('/flags/explained-context?explain=true')
      .expect(200);

    expect(response.body.reason).toBe('context_required');
    expect(response.body.trace).toMatchObject({
      rule: 'rolloutPercentage',
      rolloutPercentage: 50,
      userId: null,
      bucket: null,
    });
  });

  it('explains a missing flag when explain=true', async () => {
    const response = await request(app).get('/flags/ghost-flag?explain=true').expect(200);

    expect(response.body.reason).toBe('flag_not_found');
    expect(response.body.trace).toMatchObject({
      flagFound: false,
      rule: 'none',
      bucket: null,
    });
  });
});

describe('admin flag routes', () => {
  let app;
  let prisma;
  let redis;

  beforeEach(async () => {
    ({ app, prisma, redis } = createTestServer());
    await prisma.auditEvent.deleteMany();
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
    expect(response.body.environment).toBe('production');
  });

  it('allows the same flag key in different environments', async () => {
    await request(app)
      .post('/admin/flags')
      .set('x-api-key', ADMIN_API_KEY)
      .send({
        key: 'shared-key',
        environment: 'production',
        enabled: false,
      })
      .expect(201);

    await request(app)
      .post('/admin/flags')
      .set('x-api-key', ADMIN_API_KEY)
      .send({
        key: 'shared-key',
        environment: 'staging',
        enabled: true,
      })
      .expect(201);

    const production = await request(app)
      .get('/admin/flags/shared-key?environment=production')
      .set('x-api-key', ADMIN_API_KEY)
      .expect(200);
    const staging = await request(app)
      .get('/admin/flags/shared-key?environment=staging')
      .set('x-api-key', ADMIN_API_KEY)
      .expect(200);

    expect(production.body.enabled).toBe(false);
    expect(staging.body.enabled).toBe(true);
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

  it('records audit events for create, update, toggle, and delete', async () => {
    await request(app)
      .post('/admin/flags')
      .set('x-api-key', ADMIN_API_KEY)
      .send({
        key: 'audited-flag',
        enabled: true,
        rules: { rolloutPercentage: 25 },
      })
      .expect(201);

    await request(app)
      .put('/admin/flags/audited-flag')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ rules: { rolloutPercentage: 50 } })
      .expect(200);

    await request(app)
      .put('/admin/flags/audited-flag')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ enabled: false })
      .expect(200);

    await request(app)
      .delete('/admin/flags/audited-flag')
      .set('x-api-key', ADMIN_API_KEY)
      .expect(204);

    const response = await request(app)
      .get('/admin/flags/audited-flag/audit')
      .set('x-api-key', ADMIN_API_KEY)
      .expect(200);

    expect(response.body.map((event) => event.action)).toEqual(['delete', 'toggle', 'update', 'create']);
    expect(response.body.every((event) => event.actor === 'admin-api-key')).toBe(true);
    expect(response.body[0].before.key).toBe('audited-flag');
    expect(response.body[0].after).toBeNull();
    expect(response.body[3].before).toBeNull();
    expect(response.body[3].after.key).toBe('audited-flag');
  });

  it('keeps audit events isolated by environment', async () => {
    await request(app)
      .post('/admin/flags')
      .set('x-api-key', ADMIN_API_KEY)
      .send({
        key: 'environment-audit',
        environment: 'production',
      })
      .expect(201);

    await request(app)
      .post('/admin/flags')
      .set('x-api-key', ADMIN_API_KEY)
      .send({
        key: 'environment-audit',
        environment: 'staging',
      })
      .expect(201);

    await request(app)
      .put('/admin/flags/environment-audit?environment=staging')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ enabled: true })
      .expect(200);

    const production = await request(app)
      .get('/admin/flags/environment-audit/audit?environment=production')
      .set('x-api-key', ADMIN_API_KEY)
      .expect(200);
    const staging = await request(app)
      .get('/admin/flags/environment-audit/audit?environment=staging')
      .set('x-api-key', ADMIN_API_KEY)
      .expect(200);

    expect(production.body.map((event) => event.action)).toEqual(['create']);
    expect(staging.body.map((event) => event.action)).toEqual(['toggle', 'create']);
  });

  it('requires x-api-key for audit routes', async () => {
    await request(app).get('/admin/flags/any-flag/audit').expect(401);
    await request(app).get('/admin/flags/any-flag/audit').set('x-api-key', 'wrong-key').expect(403);
  });
});

describe('environment snapshot', () => {
  let app;
  let prisma;
  let redis;

  beforeEach(async () => {
    ({ app, prisma, redis } = createTestServer());
    await prisma.auditEvent.deleteMany();
    await prisma.featureFlag.deleteMany();
    redis.clear();
  });

  afterEach(async () => {
    await prisma.$disconnect();
    redis.quit();
  });

  it('returns an empty snapshot for an environment with no flags', async () => {
    const response = await request(app).get('/environments/production/snapshot').expect(200);

    expect(response.body).toMatchObject({
      environment: 'production',
      flags: [],
    });
    expect(response.body.checksum).toEqual(expect.any(String));
    expect(response.body.version).toBe(response.body.checksum.substring(0, 12));
    expect(response.body.generatedAt).toEqual(expect.any(String));
  });

  it('includes only the requested environment, sorted by key', async () => {
    await prisma.featureFlag.createMany({
      data: [
        { key: 'beta-flag', environment: 'production', enabled: true, rules: { rolloutPercentage: 25 } },
        { key: 'alpha-flag', environment: 'production', enabled: false, rules: {} },
        { key: 'staging-only', environment: 'staging', enabled: true, rules: {} },
      ],
    });

    const response = await request(app).get('/environments/production/snapshot').expect(200);

    expect(response.body.flags).toEqual([
      { key: 'alpha-flag', enabled: false, rules: {} },
      { key: 'beta-flag', enabled: true, rules: { rolloutPercentage: 25 } },
    ]);
  });

  it('produces a stable checksum across calls and changes it after a mutation', async () => {
    await prisma.featureFlag.create({
      data: { key: 'snapshot-flag', environment: 'production', enabled: true, rules: {} },
    });

    const first = await request(app).get('/environments/production/snapshot').expect(200);
    const second = await request(app).get('/environments/production/snapshot').expect(200);
    expect(second.body.checksum).toBe(first.body.checksum);

    await request(app)
      .put('/admin/flags/snapshot-flag')
      .set('x-api-key', ADMIN_API_KEY)
      .send({ enabled: false })
      .expect(200);

    const afterMutation = await request(app).get('/environments/production/snapshot').expect(200);
    expect(afterMutation.body.checksum).not.toBe(first.body.checksum);
    expect(afterMutation.body.flags[0].enabled).toBe(false);
  });

  it('rejects invalid snapshot environments', async () => {
    await request(app).get('/environments/qa/snapshot').expect(400);
  });
});

describe('redis disabled mode', () => {
  let app;
  let prisma;
  let redis;

  beforeEach(async () => {
    ({ app, prisma, redis } = createTestServer(createNoopRedisClient()));
    await prisma.auditEvent.deleteMany();
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
      reason: 'enabled_no_rules',
    });
  });
});
