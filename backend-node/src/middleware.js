const { verifyToken } = require('./security');
const { ApiError } = require('./apiError');
const { logger } = require('./logger');

/** Extract + verify JWT from Authorization header. Populates req.user. */
function requireAuth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const [scheme, token] = hdr.split(' ');
  if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized('Missing bearer token'));
  try {
    const decoded = verifyToken(token);
    if (decoded.type && decoded.type !== 'access') {
      return next(ApiError.unauthorized('Wrong token type'));
    }
    req.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    next();
  } catch (err) {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/** Optional — attach user if present, but don't require it. */
function optionalAuth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const [scheme, token] = hdr.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const decoded = verifyToken(token);
      req.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    } catch { /* ignore */ }
  }
  next();
}

/** Allow one of the given roles. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden(`Role ${req.user.role} not allowed`));
    next();
  };
}

/** Validate req.body / req.query / req.params with a Joi schema. */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const { value, error } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(ApiError.unprocessable('Validation failed', {
        errors: error.details.map((d) => ({ path: d.path.join('.'), message: d.message })),
      }));
    }
    req[source] = value;
    next();
  };
}

function notFound(_req, _res, next) { next(ApiError.notFound('Route not found')); }

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL' : 'ERROR');
  if (status >= 500) logger.error({ err, path: req.path, user: req.user?.id }, 'Unhandled error');
  res.status(status).json({
    error: {
      code,
      message: err.message || 'Server error',
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

/** Async handler wrapper so route handlers can throw. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requireAuth, optionalAuth, requireRole, validate, notFound, errorHandler, ah };
