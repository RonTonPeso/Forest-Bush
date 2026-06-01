const { z } = require('zod');

const ENVIRONMENTS = ['development', 'staging', 'production'];
const DEFAULT_ENVIRONMENT = 'production';
const environmentSchema = z.enum(ENVIRONMENTS);

const createFlagSchema = z.object({
  key: z.string().min(3, { message: 'key must be at least 3 characters long' }).max(100).regex(/^[a-zA-Z0-9_.-]+$/, {
    message: 'key can only contain alphanumeric characters, underscores, hyphens, and periods'
  }),
  environment: environmentSchema.default(DEFAULT_ENVIRONMENT),
  description: z.string().max(255).optional(),
  enabled: z.boolean().default(false),
  rules: z.object({
    rolloutPercentage: z.number().min(0).max(100).optional(),
  }).optional(),
  // rules: z.record(z.any()).optional(), // placeholder for more complex rules later
});

const updateFlagSchema = z.object({
  description: z.string().max(255).optional(),
  enabled: z.boolean().optional(),
  rules: z.object({
    rolloutPercentage: z.number().min(0).max(100).optional(),
  }).nullable().optional(), // allow setting rules to null to clear them
  // rules: z.record(z.any()).optional(), // placeholder for more complex rules later
});

const parseEnvironment = (value) => {
  const environment = value === undefined ? DEFAULT_ENVIRONMENT : value;
  if (typeof environment !== 'string') {
    return {
      success: false,
      error: `environment must be one of: ${ENVIRONMENTS.join(', ')}`,
    };
  }

  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    return {
      success: false,
      error: `environment must be one of: ${ENVIRONMENTS.join(', ')}`,
    };
  }

  return {
    success: true,
    environment: result.data,
  };
};

module.exports = {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENTS,
  createFlagSchema,
  updateFlagSchema,
  parseEnvironment,
};
