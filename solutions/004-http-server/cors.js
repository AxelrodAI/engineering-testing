/**
 * @fileoverview Configurable CORS middleware — origins, methods, headers, credentials, preflight.
 * @module cors
 */

/**
 * @typedef {object} CorsOptions
 * @property {string | string[] | RegExp | Function} [origin='*'] - Allowed origin(s)
 * @property {string | string[]} [methods=['GET','HEAD','PUT','PATCH','POST','DELETE']] - Allowed methods
 * @property {string | string[]} [allowedHeaders] - Allowed request headers (default: reflect request headers)
 * @property {string | string[]} [exposedHeaders] - Headers to expose to browser
 * @property {boolean} [credentials=false] - Allow cookies / auth headers
 * @property {number} [maxAge] - Preflight cache duration in seconds
 * @property {boolean} [preflightContinue=false] - Pass OPTIONS to next middleware
 * @property {number} [optionsSuccessStatus=204] - Status for successful preflight
 */

/**
 * Resolve whether an incoming origin is allowed.
 * @param {CorsOptions['origin']} allowed
 * @param {string} origin
 * @returns {string | false} - The origin to set in the header, or false to deny
 */
function resolveOrigin(allowed, origin) {
  if (!origin) return false;

  if (allowed === '*') return '*';
  if (allowed === true) return origin;
  if (allowed === false) return false;

  if (typeof allowed === 'string') {
    return allowed === origin ? origin : false;
  }

  if (Array.isArray(allowed)) {
    return allowed.includes(origin) ? origin : false;
  }

  if (allowed instanceof RegExp) {
    return allowed.test(origin) ? origin : false;
  }

  if (typeof allowed === 'function') {
    const result = allowed(origin);
    if (result === true) return origin;
    if (result === false || result == null) return false;
    return result; // string override
  }

  return false;
}

/**
 * Create a CORS middleware function.
 *
 * @param {CorsOptions} [options={}]
 * @returns {Function} Middleware (req, res, next)
 */
export function cors(options = {}) {
  const {
    origin = '*',
    methods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders,
    exposedHeaders,
    credentials = false,
    maxAge,
    preflightContinue = false,
    optionsSuccessStatus = 204,
  } = options;

  const methodsStr = Array.isArray(methods) ? methods.join(', ') : methods;
  const exposedStr = exposedHeaders
    ? (Array.isArray(exposedHeaders) ? exposedHeaders.join(', ') : exposedHeaders)
    : null;

  /**
   * @param {object} req
   * @param {object} res
   * @param {Function} next
   */
  return function corsMiddleware(req, res, next) {
    const incomingOrigin = req.headers['origin'];
    const resolvedOrigin = resolveOrigin(origin, incomingOrigin);

    if (resolvedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', resolvedOrigin);

      // Vary header is required when origin is dynamic
      if (resolvedOrigin !== '*') {
        const existing = res.getHeader('Vary') || '';
        res.setHeader('Vary', existing ? `${existing}, Origin` : 'Origin');
      }
    }

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (exposedStr) {
      res.setHeader('Access-Control-Expose-Headers', exposedStr);
    }

    // Preflight (OPTIONS) request
    if (req.method === 'OPTIONS') {
      if (resolvedOrigin) {
        res.setHeader('Access-Control-Allow-Methods', methodsStr);

        // Reflect requested headers or use configured list
        const reqHeaders = req.headers['access-control-request-headers'];
        const headersToAllow = allowedHeaders
          ? (Array.isArray(allowedHeaders) ? allowedHeaders.join(', ') : allowedHeaders)
          : reqHeaders;

        if (headersToAllow) {
          res.setHeader('Access-Control-Allow-Headers', headersToAllow);
        }

        if (maxAge != null) {
          res.setHeader('Access-Control-Max-Age', String(maxAge));
        }
      }

      if (preflightContinue) {
        return next();
      }

      res.statusCode = optionsSuccessStatus;
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }

    next();
  };
}
