const express = require('express');
const { createApiKeyAuth } = require('../middleware/auth');
const { createFlagSchema, updateFlagSchema, parseEnvironment } = require('../schemas/flagSchemas');

const incrementFlagVersion = async (redis, key, environment, logger = console) => {
  try {
    if (!redis?.disabled) {
      await redis.incr(`flag-version:${environment}:${key}`);
    }
  } catch (error) {
    logger.warn(`cache version increment failed for flag '${environment}/${key}':`, error.message);
  }
};

const getEnvironmentOrRespond = (req, res) => {
  const result = parseEnvironment(req.query.environment);

  if (!result.success) {
    res.status(400).json({ message: result.error });
    return null;
  }

  return result.environment;
};

const AUDIT_ACTOR = 'admin-api-key';
const MAX_AUDIT_LIMIT = 100;

const toAuditJson = (value) => {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
};

const createAuditEventData = ({ flagKey, environment, action, before = null, after = null }) => ({
  flagKey,
  environment,
  action,
  actor: AUDIT_ACTOR,
  before: toAuditJson(before),
  after: toAuditJson(after),
});

const parseAuditLimit = (value) => {
  if (value === undefined) return 50;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, MAX_AUDIT_LIMIT);
};

const createAdminFlagsRouter = ({ prisma, redis, adminApiKey, logger = console }) => {
  const router = express.Router();
  const apiKeyAuth = createApiKeyAuth({ adminApiKey, logger });

  router.use(express.json());

  // POST /admin/flags - Create a new feature flag
  router.post('/', apiKeyAuth, async (req, res) => {
    const validationResult = createFlagSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: 'validation failed',
        errors: validationResult.error.format()
      });
    }

    const { key, environment, description, enabled, rules } = validationResult.data;

    try {
      const newFlag = await prisma.$transaction(async (tx) => {
        const createdFlag = await tx.featureFlag.create({
          data: {
            key,
            environment,
            description,
            enabled,
            rules: rules || {},
          },
        });

        await tx.auditEvent.create({
          data: createAuditEventData({
            flagKey: key,
            environment,
            action: 'create',
            after: createdFlag,
          }),
        });

        return createdFlag;
      });

      await incrementFlagVersion(redis, key, environment, logger);
      res.status(201).json(newFlag);
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: `a flag with key '${key}' already exists in '${environment}'.` });
      }
      logger.error('Error creating feature flag:', error);
      res.status(500).json({ message: 'error creating feature flag' });
    }
  });

  // GET /admin/flags - Get a list of all feature flags
  router.get('/', apiKeyAuth, async (req, res) => {
    const environment = getEnvironmentOrRespond(req, res);
    if (!environment) return;

    try {
      const flags = await prisma.featureFlag.findMany({
        where: { environment },
        orderBy: {
          createdAt: 'desc',
        },
      });
      res.status(200).json(flags);
    } catch (error) {
      logger.error('Error fetching feature flags:', error);
      res.status(500).json({ message: 'error fetching feature flags' });
    }
  });

  // GET /admin/flags/:key/audit - Get recent audit events for one flag
  router.get('/:key/audit', apiKeyAuth, async (req, res) => {
    const { key } = req.params;
    const environment = getEnvironmentOrRespond(req, res);
    if (!environment) return;

    const limit = parseAuditLimit(req.query.limit);
    if (!limit) {
      return res.status(400).json({ message: `limit must be an integer between 1 and ${MAX_AUDIT_LIMIT}` });
    }

    try {
      const events = await prisma.auditEvent.findMany({
        where: {
          flagKey: key,
          environment,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      res.status(200).json(events);
    } catch (error) {
      logger.error(`Error fetching audit events for flag ${key}:`, error);
      res.status(500).json({ message: 'error fetching audit events' });
    }
  });

  // GET /admin/flags/:key - Get a single feature flag by key
  router.get('/:key', apiKeyAuth, async (req, res) => {
    const { key } = req.params;
    const environment = getEnvironmentOrRespond(req, res);
    if (!environment) return;

    try {
      const flag = await prisma.featureFlag.findUnique({
        where: {
          key_environment: {
            key,
            environment,
          },
        },
      });

      if (!flag) {
        return res.status(404).json({ message: `flag with key '${key}' not found in '${environment}'.` });
      }

      res.status(200).json(flag);
    } catch (error) {
      logger.error(`Error fetching feature flag with key ${key}:`, error);
      res.status(500).json({ message: 'error fetching feature flag' });
    }
  });

  // PUT /admin/flags/:key - Update a feature flag
  router.put('/:key', apiKeyAuth, async (req, res) => {
    const { key } = req.params;
    const environment = getEnvironmentOrRespond(req, res);
    if (!environment) return;

    const validationResult = updateFlagSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: 'validation failed',
        errors: validationResult.error.format()
      });
    }

    if (Object.keys(validationResult.data).length === 0) {
      return res.status(400).json({ message: 'no fields to update provided' });
    }

    try {
      const updatedFlag = await prisma.$transaction(async (tx) => {
        const existingFlag = await tx.featureFlag.findUnique({
          where: {
            key_environment: {
              key,
              environment,
            },
          },
        });

        if (!existingFlag) {
          return null;
        }

        const changedFlag = await tx.featureFlag.update({
          where: {
            key_environment: {
              key,
              environment,
            },
          },
          data: validationResult.data,
        });

        const action = Object.keys(validationResult.data).length === 1 && validationResult.data.enabled !== undefined
          ? 'toggle'
          : 'update';

        await tx.auditEvent.create({
          data: createAuditEventData({
            flagKey: key,
            environment,
            action,
            before: existingFlag,
            after: changedFlag,
          }),
        });

        return changedFlag;
      });

      if (!updatedFlag) {
        return res.status(404).json({ message: `flag with key '${key}' not found in '${environment}'.` });
      }

      await incrementFlagVersion(redis, key, environment, logger);

      res.status(200).json(updatedFlag);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: `flag with key '${key}' not found in '${environment}'.` });
      }
      logger.error(`Error updating feature flag with key ${key}:`, error);
      res.status(500).json({ message: 'error updating feature flag' });
    }
  });

  // DELETE /admin/flags/:key - Delete a feature flag
  router.delete('/:key', apiKeyAuth, async (req, res) => {
    const { key } = req.params;
    const environment = getEnvironmentOrRespond(req, res);
    if (!environment) return;

    try {
      const deletedFlag = await prisma.$transaction(async (tx) => {
        const existingFlag = await tx.featureFlag.findUnique({
          where: {
            key_environment: {
              key,
              environment,
            },
          },
        });

        if (!existingFlag) {
          return null;
        }

        await tx.featureFlag.delete({
          where: {
            key_environment: {
              key,
              environment,
            },
          },
        });

        await tx.auditEvent.create({
          data: createAuditEventData({
            flagKey: key,
            environment,
            action: 'delete',
            before: existingFlag,
          }),
        });

        return existingFlag;
      });

      if (!deletedFlag) {
        return res.status(404).json({ message: `flag with key '${key}' not found in '${environment}'.` });
      }

      await incrementFlagVersion(redis, key, environment, logger);

      res.status(204).send();
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: `flag with key '${key}' not found in '${environment}'.` });
      }
      logger.error(`Error deleting feature flag with key ${key}:`, error);
      res.status(500).json({ message: 'error deleting feature flag' });
    }
  });

  return router;
};

module.exports = { createAdminFlagsRouter, incrementFlagVersion };
