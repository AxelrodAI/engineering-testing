/**
 * Request wrapper — decorates the raw Node IncomingMessage with helpers.
 * Zero extra deps (url module is Node built-in).
 */
import { URL } from 'node:url';

const DEFAULT_BODY_LIMIT = 1024 * 1024; // 1 MB

export function wrapRequest(req, params = {}) {
  // Parse the URL once
  const base = `http://${req.headers.host || 'localhost'}`;
  const parsed = new URL(req.url, base);

  req.pathname = parsed.pathname;
  req.params   = params;
  req.query    = Object.fromEntries(parsed.searchParams.entries());
  req.body     = undefined;   // populated by parseBody()

  return req;
}

/**
 * Read + parse the request body.
 * Supports: application/json, application/x-www-form-urlencoded, text/*, default buffer.
 * Returns the parsed value and attaches it to req.body.
 */
export function parseBody(req, { limit = DEFAULT_BODY_LIMIT } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const ct  = (req.headers['content-type'] || '').split(';')[0].trim();

      let body;
      if (ct === 'application/json') {
        try { body = JSON.parse(raw.toString('utf8')); }
        catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); return; }
      } else if (ct === 'application/x-www-form-urlencoded') {
        body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')).entries());
      } else if (ct.startsWith('text/')) {
        body = raw.toString('utf8');
      } else {
        body = raw;   // Buffer for binary content types
      }

      req.body = body;
      resolve(body);
    });

    req.on('error', reject);
  });
}
