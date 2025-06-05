const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.warn('STARTUP WARNING: ADMIN_API_KEY is not set. Admin routes will not be protected.');
}

const apiKeyAuth = (req, res, next) => {
  if (!ADMIN_API_KEY) {
    // for local dev, we can allow access without a key, but log a warning.
    // in a real production environment, this should probably be a hard error.
    console.warn('Warning: ADMIN_API_KEY is not set in env. Allowing access to admin route.');
    return next();
  }

  const receivedApiKey = req.headers['x-api-key'];

  if (!receivedApiKey) {
    return res.status(401).json({ error: 'unauthorized: api key required in x-api-key header.' });
  }

  if (receivedApiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'forbidden: invalid api key.' });
  }
  
  next();
};

module.exports = { apiKeyAuth }; 