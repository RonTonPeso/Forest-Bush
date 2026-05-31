const createApiKeyAuth = ({ adminApiKey = process.env.ADMIN_API_KEY, logger = console } = {}) => {
  if (!adminApiKey) {
    logger.warn('STARTUP WARNING: ADMIN_API_KEY is not set. Admin routes will not be protected.');
  }

  return (req, res, next) => {
    if (!adminApiKey) {
      logger.warn('Warning: ADMIN_API_KEY is not set in env. Allowing access to admin route.');
      return next();
    }

    const receivedApiKey = req.headers['x-api-key'];

    if (!receivedApiKey) {
      return res.status(401).json({ error: 'unauthorized: api key required in x-api-key header.' });
    }

    if (receivedApiKey !== adminApiKey) {
      return res.status(403).json({ error: 'forbidden: invalid api key.' });
    }

    next();
  };
};

module.exports = { createApiKeyAuth };
