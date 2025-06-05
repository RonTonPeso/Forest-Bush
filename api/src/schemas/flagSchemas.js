const { z } = require('zod');

const createFlagSchema = z.object({
  key: z.string().min(3, { message: 'key must be at least 3 characters long' }).max(100).regex(/^[a-zA-Z0-9_.-]+$/, {
    message: 'key can only contain alphanumeric characters, underscores, hyphens, and periods'
  }),
  description: z.string().max(255).optional(),
  enabled: z.boolean().default(false),
  // rules: z.record(z.any()).optional(), // placeholder for more complex rules later
});

module.exports = { createFlagSchema }; 