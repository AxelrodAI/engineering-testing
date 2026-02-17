/**
 * Built-in middleware: CORS, body-parser, static file serving.
 * Zero extra deps (fs, path, url are all built-ins).
 */
import fs   from 'node:fs';
import path from 'node:path';
import { parseBody } from './request.js';

// ─── CORS ─────────────────────────────────────────────────────────────────────

const DEFAULT_CORS = {
  origins: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
};

export function cors(opts = {}) {
  const cfg = { ...DEFAULT_CORS, ...opts };
  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    let allowOrigin = null;
    if (cfg.origins === '*') {
      allowOrigin = '*';
    } else if (typeof cfg.origins === 'string') {
      allowOrigin = cfg.origins;
    } else if (Array.isArray(cfg.origins)) {
      allowOrigin = cfg.origins.includes(origin) ? origin : null;
    }
    if (allowOrigin) res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    if (cfg.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', cfg.methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', cfg.headers.join(', '));
      res.setHeader('Access-Control-Max-Age', String(cfg.maxAge));
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
}

// ─── Body parser ──────────────────────────────────────────────────────────────

export function bodyParser({ limit } = {}) {
  return async function bodyParserMiddleware(req, res, next) {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body === undefined) {
      try {
        await parseBody(req, { limit });
      } catch (err) {
        next(err);
        return;
      }
    }
    next();
  };
}

// ─── Static file serving ──────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

function mimeType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

export function staticFiles(root, { strip = '/', index = 'index.html' } = {}) {
  const absRoot = path.resolve(root);
  return function staticMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { next(); return; }
    let urlPath = req.pathname || req.url.split('?')[0];
    if (strip !== '/' && urlPath.startsWith(strip)) {
      urlPath = urlPath.slice(strip.length) || '/';
    }
    const rel = urlPath.replace(/^\/+/, '') || '';
    const abs = path.resolve(absRoot, rel);
    if (!abs.startsWith(absRoot)) { res.statusCode = 403; res.end('Forbidden'); return; }
    let stat;
    try { stat = fs.statSync(abs); } catch { next(); return; }
    let filePath = abs;
    if (stat.isDirectory()) {
      const idx = path.join(abs, index);
      try { fs.statSync(idx); filePath = idx; } catch { next(); return; }
    }
    let content;
    try { content = fs.readFileSync(filePath); } catch { next(); return; }
    res.setHeader('Content-Type', mimeType(filePath));
    res.setHeader('Content-Length', content.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.statusCode = 200;
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(content);
  };
}
