const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { apiKeyAuth } = require('../middleware/auth');
const { createFlagSchema } = require('../schemas/flagSchemas');

const prisma = new PrismaClient();
const router = express.Router();

// Middleware to parse JSON bodies, specific to this router
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

  const { key, description, enabled } = validationResult.data;

  try {
    const newFlag = await prisma.featureFlag.create({
      data: {
        key,
        description,
        enabled,
        // rules: {} // default to empty json object if rules are to be non-null in db
      },
    });
    res.status(201).json(newFlag);
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('key')) {
      // Unique constraint failed for the key
      return res.status(409).json({ message: `a flag with key '${key}' already exists.` });
    }
    console.error('Error creating feature flag:', error);
    res.status(500).json({ message: 'error creating feature flag' });
  }
});

// GET /admin/flags - Get a list of all feature flags
router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.status(200).json(flags);
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    res.status(500).json({ message: 'error fetching feature flags' });
  }
});

// GET /admin/flags/:key - Get a single feature flag by key
router.get('/:key', apiKeyAuth, async (req, res) => {
  const { key } = req.params;

  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!flag) {
      return res.status(404).json({ message: `flag with key '${key}' not found.` });
    }

    res.status(200).json(flag);
  } catch (error) {
    console.error(`Error fetching feature flag with key ${key}:`, error);
    res.status(500).json({ message: 'error fetching feature flag' });
  }
});

module.exports = router; 