/**
 * @fileoverview Static file serving middleware with MIME type resolution.
 * @module static
 */

import { createReadStream, statSync } from 'node:fs';
import { join, extname, resolve, normalize } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.bmp':  'image/bmp',
  '.pdf':  'application/pdf',
  '.zip':  'application/zip',
  '.gz':   'application/gzip',
  '.wasm': 'application/wasm',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.eot':  'application/vnd.ms-fontobject',
};

/**
 * Resolve MIME type for a file extension.
 * @param {string} ext - File extension including dot (e.g. '.html')
 * @returns {string}
 */
export function getMimeType(ext) {
  return MIME_TYPES[ext.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Create a static file serving middleware.
 * Prevents path traversal by resolving to absolute and checking against root.
 *
 * @param {string} root - Directory to serve files from
 * @param {object} [options]
 * @param {string} [options.prefix='/'] - URL prefix to strip
 * @param {string} [options.index='index.html'] - Default file for directory requests
 * @returns {Function} Middleware (req, res, next)
 */
export function serveStatic(root, options = {}) {
  const { prefix = '/', index = 'index.html' } = options;
  const absRoot = resolve(root);
  const normalPrefix = prefix.replace(/\/$/, '') || '';

  return function staticMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const reqPath = req.path || (req.url || '/').split('?')[0];

    let filePath = reqPath;
    if (normalPrefix && reqPath.startsWith(normalPrefix)) {
      filePath = reqPath.slice(normalPrefix.length) || '/';
    }

    let decoded;
    try { decoded = decodeURIComponent(filePath); } catch { return next(); }

    const normalised = normalize(decoded);
    const absPath = join(absRoot, normalised);

    // Security: block path traversal
    if (!absPath.startsWith(absRoot + '/') && absPath !== absRoot) return next();

    let stat;
    try { stat = statSync(absPath); } catch { return next(); }

    let target = absPath;
    if (stat.isDirectory()) {
      target = join(absPath, index);
      try {
        if (!statSync(target).isFile()) return next();
      } catch { return next(); }
    } else if (!stat.isFile()) {
      return next();
    }

    let finalStat;
    try { finalStat = statSync(target); } catch { return next(); }

    res.setHeader('Content-Type', getMimeType(extname(target)));
    res.setHeader('Content-Length', finalStat.size);
    res.statusCode = 200;

    if (req.method === 'HEAD') { res.end(); return; }

    const stream = createReadStream(target);
    stream.on('error', () => {
      if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
    });
    stream.pipe(res, { end: true });
  };
}
