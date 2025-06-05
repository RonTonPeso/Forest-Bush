const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.warn('STARTUP WARNING: ADMIN_API_KEY is not set. Admin routes will not be protected.');
}

const apiKeyAuth = (req, res, next) => {
  console.log('[Auth Middleware] Request Path:', req.path);
  
  const envKeyForLog = ADMIN_API_KEY ? `(Exists, first 5: "${ADMIN_API_KEY.substring(0, 5)}...")` : 'NOT SET in process.env';
  console.log('[Auth Middleware] Loaded ADMIN_API_KEY from env:', envKeyForLog);
  
  const receivedApiKeyHeader = req.headers['x-api-key'];
  const reqKeyForLog = receivedApiKeyHeader ? `(Present, first 5: "${receivedApiKeyHeader.substring(0, 5)}...")` : 'NOT PRESENT in headers';
  console.log('[Auth Middleware] Received X-API-Key header:', reqKeyForLog);

  if (!ADMIN_API_KEY) {
    console.warn('[Auth Middleware] Runtime Warning: ADMIN_API_KEY is not set in env. Allowing access to admin route without authentication.');
    return next();
  }

  if (!receivedApiKeyHeader) {
    console.log('[Auth Middleware] No API key in header. Returning 401.');
    return res.status(401).json({ error: 'unauthorized: api key required in x-api-key header.' });
  }

  if (receivedApiKeyHeader !== ADMIN_API_KEY) {
    console.log('[Auth Middleware] Invalid API key (header vs env mismatch). Returning 403.');
    return res.status(403).json({ error: 'forbidden: invalid api key.' });
  }
  
  console.log('[Auth Middleware] API key valid. Proceeding.');
  next();
};

module.exports = { apiKeyAuth }; 