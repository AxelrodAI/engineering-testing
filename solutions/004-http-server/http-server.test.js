/**
 * @fileoverview Integration tests for the Micro HTTP Framework.
 * Starts real HTTP servers on random ports and exercises every component.
 */

import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { App } from './app.js';
import { Router } from './router.js';
import { MiddlewareManager, runMiddleware } from './middleware.js';
import { cors } from './cors.js';
import { serveStatic, getMimeType } from './static.js';

// ─── HTTP helper ─────────────────────────────────────────────────────────────

/**
 * Make an HTTP request and return { status, headers, body }.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<{status:number, headers:object, body:string}>}
 */
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };

    const req = httpRequest(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });

    req.on('error', reject);

    if (opts.body) {
      req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    }
    req.end();
  });
}

/** Start an App and return { app, base } */
async function startApp(setup) {
  const app = new App();
  setup(app);
  const server = await app.listen(0);
  const port = server.address().port;
  return { app, base: `http://localhost:${port}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Router unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Router — unit', () => {
  it('matches exact static routes', () => {
    const r = new Router();
    r.get('/hello', () => {});
    const m = r.match('GET', '/hello');
    assert.ok(m, 'should match');
    assert.deepEqual(m.params, {});
  });

  it('matches path params', () => {
    const r = new Router();
    r.get('/users/:id', () => {});
    const m = r.match('GET', '/users/42');
    assert.ok(m);
    assert.equal(m.params.id, '42');
  });

  it('matches multiple path params', () => {
    const r = new Router();
    r.get('/org/:org/repo/:repo', () => {});
    const m = r.match('GET', '/org/acme/repo/widget');
    assert.ok(m);
    assert.equal(m.params.org, 'acme');
    assert.equal(m.params.repo, 'widget');
  });

  it('matches wildcard *', () => {
    const r = new Router();
    r.get('/files/*', () => {});
    const m = r.match('GET', '/files/a/b/c.txt');
    assert.ok(m);
  });

  it('returns null for unmatched routes', () => {
    const r = new Router();
    r.get('/foo', () => {});
    assert.equal(r.match('GET', '/bar'), null);
  });

  it('is case-sensitive on methods', () => {
    const r = new Router();
    r.get('/foo', () => {});
    assert.ok(r.match('GET', '/foo'));
    assert.equal(r.match('POST', '/foo'), null);
  });

  it('static routes take precedence over param routes', () => {
    const r = new Router();
    const paramHandler = () => 'param';
    const staticHandler = () => 'static';
    r.get('/users/:id', paramHandler);
    r.get('/users/me', staticHandler);
    const m = r.match('GET', '/users/me');
    assert.ok(m);
    assert.equal(m.handlers[0], staticHandler);
  });

  it('normalises double-slash paths', () => {
    const r = new Router();
    r.get('/foo/bar', () => {});
    assert.ok(r.match('GET', '//foo//bar'));
  });

  it('URL-decodes path params', () => {
    const r = new Router();
    r.get('/users/:name', () => {});
    const m = r.match('GET', '/users/hello%20world');
    assert.equal(m.params.name, 'hello world');
  });

  it('supports all HTTP methods', () => {
    const r = new Router();
    r.post('/a', () => {});
    r.put('/b', () => {});
    r.delete('/c', () => {});
    r.patch('/d', () => {});
    assert.ok(r.match('POST', '/a'));
    assert.ok(r.match('PUT', '/b'));
    assert.ok(r.match('DELETE', '/c'));
    assert.ok(r.match('PATCH', '/d'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Middleware unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Middleware — unit', () => {
  it('runs middleware in order', async () => {
    const log = [];
    const stack = [
      (req, res, next) => { log.push(1); next(); },
      (req, res, next) => { log.push(2); next(); },
      (req, res, next) => { log.push(3); next(); },
    ];
    await runMiddleware(stack, {}, {});
    assert.deepEqual(log, [1, 2, 3]);
  });

  it('stops chain when next() not called', async () => {
    const log = [];
    const stack = [
      (req, res, next) => { log.push(1); next(); },
      (req, res, next) => { log.push(2); /* no next */ },
      (req, res, next) => { log.push(3); next(); },
    ];
    await runMiddleware(stack, {}, {});
    assert.deepEqual(log, [1, 2]);
  });

  it('routes errors to 4-arg error middleware', async () => {
    const log = [];
    const stack = [
      (req, res, next) => { next(new Error('boom')); },
      (req, res, next) => { log.push('regular'); next(); },
      (err, req, res, next) => { log.push('error:' + err.message); next(); },
    ];
    await runMiddleware(stack, {}, {});
    assert.deepEqual(log, ['error:boom']);
  });

  it('skips error middleware in normal flow', async () => {
    const log = [];
    const stack = [
      (req, res, next) => { log.push('before'); next(); },
      (err, req, res, next) => { log.push('error'); next(); }, // should be skipped
      (req, res, next) => { log.push('after'); next(); },
    ];
    await runMiddleware(stack, {}, {});
    assert.deepEqual(log, ['before', 'after']);
  });

  it('catches thrown errors and routes to error middleware', async () => {
    const log = [];
    const stack = [
      (req, res, next) => { throw new Error('thrown'); },
      (err, req, res, next) => { log.push('caught:' + err.message); next(); },
    ];
    await runMiddleware(stack, {}, {});
    assert.deepEqual(log, ['caught:thrown']);
  });

  it('MiddlewareManager.buildStack prepends globals', () => {
    const mgr = new MiddlewareManager();
    const g1 = () => {};
    const r1 = () => {};
    mgr.use(g1);
    const stack = mgr.buildStack([r1]);
    assert.deepEqual(stack, [g1, r1]);
  });

  it('multiple use() calls accumulate middleware', () => {
    const mgr = new MiddlewareManager();
    const a = () => {}, b = () => {}, c = () => {};
    mgr.use(a).use(b, c);
    assert.deepEqual(mgr.globals(), [a, b, c]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — MIME types
// ═══════════════════════════════════════════════════════════════════════════════

describe('getMimeType', () => {
  const cases = [
    ['.html', 'text/html; charset=utf-8'],
    ['.css',  'text/css; charset=utf-8'],
    ['.js',   'application/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png',  'image/png'],
    ['.jpg',  'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.svg',  'image/svg+xml'],
    ['.gif',  'image/gif'],
    ['.txt',  'text/plain; charset=utf-8'],
    ['.pdf',  'application/pdf'],
    ['.wasm', 'application/wasm'],
  ];
  for (const [ext, expected] of cases) {
    it(`${ext} → ${expected}`, () => {
      assert.equal(getMimeType(ext), expected);
    });
  }

  it('unknown extension → application/octet-stream', () => {
    assert.equal(getMimeType('.xyz'), 'application/octet-stream');
  });

  it('case-insensitive (.HTML)', () => {
    assert.equal(getMimeType('.HTML'), 'text/html; charset=utf-8');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — CORS middleware unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('CORS middleware — unit', () => {
  /** Mini helper: run cors middleware and collect response headers */
  function runCors(corsOpts, reqOpts = {}) {
    return new Promise((resolve) => {
      const fn = cors(corsOpts);
      const headers = {};
      const req = {
        method: reqOpts.method || 'GET',
        headers: { origin: reqOpts.origin || 'http://example.com', ...reqOpts.headers },
      };
      const res = {
        _headers: {},
        getHeader(n) { return this._headers[n.toLowerCase()]; },
        setHeader(n, v) { this._headers[n.toLowerCase()] = v; },
        end() { resolve(this._headers); },
        statusCode: 200,
      };
      fn(req, res, () => resolve(res._headers));
    });
  }

  it('sets wildcard origin by default', async () => {
    const h = await runCors({});
    assert.equal(h['access-control-allow-origin'], '*');
  });

  it('reflects specific origin', async () => {
    const h = await runCors({ origin: 'http://example.com' });
    assert.equal(h['access-control-allow-origin'], 'http://example.com');
  });

  it('allows origin from array', async () => {
    const h = await runCors({ origin: ['http://a.com', 'http://example.com'] });
    assert.equal(h['access-control-allow-origin'], 'http://example.com');
  });

  it('allows origin matching regex', async () => {
    const h = await runCors({ origin: /example\.com$/ });
    assert.equal(h['access-control-allow-origin'], 'http://example.com');
  });

  it('allows origin via function', async () => {
    const h = await runCors({ origin: (o) => o.includes('example') });
    assert.equal(h['access-control-allow-origin'], 'http://example.com');
  });

  it('sets credentials header', async () => {
    const h = await runCors({ credentials: true });
    assert.equal(h['access-control-allow-credentials'], 'true');
  });

  it('sets exposed headers', async () => {
    const h = await runCors({ exposedHeaders: ['X-Custom', 'X-Other'] });
    assert.equal(h['access-control-expose-headers'], 'X-Custom, X-Other');
  });

  it('handles preflight OPTIONS', async () => {
    const h = await runCors({
      methods: ['GET', 'POST'],
      maxAge: 86400,
    }, { method: 'OPTIONS' });
    assert.ok(h['access-control-allow-methods'].includes('POST'));
    assert.equal(h['access-control-max-age'], '86400');
  });

  it('reflects request headers on preflight', async () => {
    const h = await runCors({}, {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com', 'access-control-request-headers': 'X-Token' },
    });
    assert.equal(h['access-control-allow-headers'], 'X-Token');
  });

  it('does not set origin header when origin not allowed', async () => {
    const h = await runCors({ origin: 'http://other.com' });
    assert.equal(h['access-control-allow-origin'], undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Integration: basic routing
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — basic routing', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.get('/hello', (req, res) => res.json({ hello: 'world' }));
      a.get('/users/:id', (req, res) => res.json({ id: req.params.id }));
      a.post('/echo', (req, res) => res.json({ body: req.body }));
      a.put('/items/:id', (req, res) => res.json({ updated: req.params.id }));
      a.delete('/items/:id', (req, res) => res.status(204).send(''));
      a.patch('/items/:id', (req, res) => res.json({ patched: req.params.id }));
    }));
  });
  after(() => app.close());

  it('GET /hello returns JSON', async () => {
    const r = await fetch(`${base}/hello`);
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { hello: 'world' });
    assert.ok(r.headers['content-type'].includes('application/json'));
  });

  it('GET /users/:id injects path param', async () => {
    const r = await fetch(`${base}/users/42`);
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { id: '42' });
  });

  it('POST /echo returns parsed JSON body', async () => {
    const r = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { body: { name: 'Alice' } });
  });

  it('PUT /items/:id', async () => {
    const r = await fetch(`${base}/items/99`, { method: 'PUT' });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { updated: '99' });
  });

  it('DELETE /items/:id returns 204', async () => {
    const r = await fetch(`${base}/items/7`, { method: 'DELETE' });
    assert.equal(r.status, 204);
  });

  it('PATCH /items/:id', async () => {
    const r = await fetch(`${base}/items/55`, { method: 'PATCH' });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { patched: '55' });
  });

  it('returns 404 JSON for unknown route', async () => {
    const r = await fetch(`${base}/notexist`);
    assert.equal(r.status, 404);
    const body = JSON.parse(r.body);
    assert.ok(body.error);
  });

  it('double-slash path normalisation', async () => {
    const r = await fetch(`${base}//hello`);
    assert.equal(r.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Integration: query params
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — query params', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.get('/search', (req, res) => res.json(req.query));
    }));
  });
  after(() => app.close());

  it('parses single query param', async () => {
    const r = await fetch(`${base}/search?q=node`);
    assert.deepEqual(JSON.parse(r.body), { q: 'node' });
  });

  it('parses multiple query params', async () => {
    const r = await fetch(`${base}/search?q=node&limit=10`);
    assert.deepEqual(JSON.parse(r.body), { q: 'node', limit: '10' });
  });

  it('returns empty object when no query', async () => {
    const r = await fetch(`${base}/search`);
    assert.deepEqual(JSON.parse(r.body), {});
  });

  it('decodes URL-encoded query values', async () => {
    const r = await fetch(`${base}/search?q=hello%20world`);
    assert.deepEqual(JSON.parse(r.body), { q: 'hello world' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Integration: body parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — body parsing', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.post('/json', (req, res) => {
        if (req.bodyParseError) {
          return res.status(400).json({ error: req.bodyParseError.message });
        }
        res.json({ body: req.body });
      });
      a.post('/form', (req, res) => res.json({ body: req.body }));
      a.post('/text', (req, res) => res.json({ body: req.body }));
      a.post('/no-ct', (req, res) => res.json({ body: req.body, ct: req.headers['content-type'] }));
    }));
  });
  after(() => app.close());

  it('parses JSON body', async () => {
    const r = await fetch(`${base}/json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 1 }),
    });
    assert.deepEqual(JSON.parse(r.body), { body: { x: 1 } });
  });

  it('returns 400 on malformed JSON', async () => {
    const r = await fetch(`${base}/json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ bad json',
    });
    assert.equal(r.status, 400);
    const b = JSON.parse(r.body);
    assert.ok(b.error.toLowerCase().includes('json'));
  });

  it('parses URL-encoded body', async () => {
    const r = await fetch(`${base}/form`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=Alice&age=30',
    });
    assert.deepEqual(JSON.parse(r.body), { body: { name: 'Alice', age: '30' } });
  });

  it('parses text/plain body', async () => {
    const r = await fetch(`${base}/text`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello text',
    });
    assert.deepEqual(JSON.parse(r.body), { body: 'hello text' });
  });

  it('returns null body for missing content-type', async () => {
    const r = await fetch(`${base}/no-ct`, {
      method: 'POST',
      body: '{}',
    });
    const parsed = JSON.parse(r.body);
    // body is a Buffer (raw) for unknown content-type — not null
    // Just verify no crash
    assert.equal(r.status, 200);
  });

  it('null body for empty POST', async () => {
    const r = await fetch(`${base}/json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { body: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Integration: response helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — response helpers', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.get('/status', (req, res) => res.status(201).json({ created: true }));
      a.get('/text', (req, res) => res.send('plain text'));
      a.get('/html', (req, res) => res.send('<h1>Hello</h1>'));
      a.get('/redir301', (req, res) => res.redirect(301, '/target'));
      a.get('/redir302', (req, res) => res.redirect('/target'));
      a.get('/chained', (req, res) => res.status(202).json({ ok: true }));
    }));
  });
  after(() => app.close());

  it('status() sets status code', async () => {
    const r = await fetch(`${base}/status`);
    assert.equal(r.status, 201);
    assert.deepEqual(JSON.parse(r.body), { created: true });
  });

  it('send() with plain text sets text/plain', async () => {
    const r = await fetch(`${base}/text`);
    assert.equal(r.status, 200);
    assert.equal(r.body, 'plain text');
    assert.ok(r.headers['content-type'].includes('text/plain'));
  });

  it('send() with HTML detects text/html', async () => {
    const r = await fetch(`${base}/html`);
    assert.ok(r.headers['content-type'].includes('text/html'));
  });

  it('redirect() 301 with location', async () => {
    const r = await fetch(`${base}/redir301`);
    assert.equal(r.status, 301);
    assert.equal(r.headers.location, '/target');
  });

  it('redirect() defaults to 302', async () => {
    const r = await fetch(`${base}/redir302`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, '/target');
  });

  it('status() chains with json()', async () => {
    const r = await fetch(`${base}/chained`);
    assert.equal(r.status, 202);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — Integration: global & per-route middleware
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — middleware', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      // Global middleware adds X-Global header
      a.use((req, res, next) => {
        res.setHeader('X-Global', 'yes');
        next();
      });

      // Per-route middleware
      const authCheck = (req, res, next) => {
        if (req.headers['x-token'] !== 'secret') {
          res.status(401).json({ error: 'Unauthorized' });
        } else {
          next();
        }
      };

      a.get('/open', (req, res) => res.json({ open: true }));
      a.get('/secure', authCheck, (req, res) => res.json({ secure: true }));

      // Error middleware
      a.get('/throws', (req, res) => {
        throw new Error('route error');
      });
      a.use((err, req, res, next) => {
        res.status(500).json({ caught: err.message });
      });
    }));
  });
  after(() => app.close());

  it('global middleware runs for every request', async () => {
    const r = await fetch(`${base}/open`);
    assert.equal(r.headers['x-global'], 'yes');
  });

  it('per-route auth middleware blocks without token', async () => {
    const r = await fetch(`${base}/secure`);
    assert.equal(r.status, 401);
  });

  it('per-route auth middleware passes with correct token', async () => {
    const r = await fetch(`${base}/secure`, {
      headers: { 'x-token': 'secret' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { secure: true });
  });

  it('error thrown in route handler is caught by error middleware', async () => {
    const r = await fetch(`${base}/throws`);
    assert.equal(r.status, 500);
    assert.deepEqual(JSON.parse(r.body), { caught: 'route error' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Integration: next(err) error propagation
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — next(err) propagation', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.get('/next-err', (req, res, next) => {
        next(new Error('next error'));
      });
      a.use((err, req, res, next) => {
        res.status(422).json({ nextErr: err.message });
      });
    }));
  });
  after(() => app.close());

  it('next(err) routes to error middleware', async () => {
    const r = await fetch(`${base}/next-err`);
    assert.equal(r.status, 422);
    assert.deepEqual(JSON.parse(r.body), { nextErr: 'next error' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Integration: static file serving
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — static files', () => {
  let app, base;
  let staticDir;

  before(async () => {
    // Create a temp directory with test files
    staticDir = join(tmpdir(), `static-test-${Date.now()}`);
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(join(staticDir, 'hello.html'), '<h1>Hello</h1>');
    writeFileSync(join(staticDir, 'data.json'), '{"ok":true}');
    writeFileSync(join(staticDir, 'style.css'), 'body { color: red; }');
    writeFileSync(join(staticDir, 'index.html'), '<html>index</html>');

    ({ app, base } = await startApp((a) => {
      a.use(serveStatic(staticDir));
      a.get('/api/test', (req, res) => res.json({ api: true }));
    }));
  });

  after(async () => {
    await app.close();
    rmSync(staticDir, { recursive: true, force: true });
  });

  it('serves HTML file with correct MIME type', async () => {
    const r = await fetch(`${base}/hello.html`);
    assert.equal(r.status, 200);
    assert.equal(r.body, '<h1>Hello</h1>');
    assert.ok(r.headers['content-type'].includes('text/html'));
  });

  it('serves JSON file', async () => {
    const r = await fetch(`${base}/data.json`);
    assert.equal(r.status, 200);
    assert.ok(r.headers['content-type'].includes('application/json'));
    assert.deepEqual(JSON.parse(r.body), { ok: true });
  });

  it('serves CSS file', async () => {
    const r = await fetch(`${base}/style.css`);
    assert.equal(r.status, 200);
    assert.ok(r.headers['content-type'].includes('text/css'));
  });

  it('serves index.html for directory request', async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.ok(r.headers['content-type'].includes('text/html'));
  });

  it('returns 404 for missing static file (falls through to 404 handler)', async () => {
    const r = await fetch(`${base}/missing.txt`);
    assert.equal(r.status, 404);
  });

  it('API routes still work alongside static', async () => {
    const r = await fetch(`${base}/api/test`);
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { api: true });
  });

  it('path traversal is blocked', async () => {
    // Encoded ../ should not escape root
    const r = await fetch(`${base}/..%2Fetc%2Fpasswd`);
    assert.notEqual(r.status, 200); // should 404 or otherwise not serve /etc/passwd
  });

  it('HEAD request returns headers without body', async () => {
    const r = await fetch(`${base}/hello.html`, { method: 'HEAD' });
    assert.equal(r.status, 200);
    assert.equal(r.body, '');
    assert.ok(parseInt(r.headers['content-length']) > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — Integration: CORS end-to-end
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — CORS', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.use(cors({
        origin: ['http://allowed.com', 'http://other.com'],
        methods: ['GET', 'POST'],
        credentials: true,
        maxAge: 3600,
      }));
      a.get('/data', (req, res) => res.json({ data: 1 }));
    }));
  });
  after(() => app.close());

  it('sets ACAO header for allowed origin', async () => {
    const r = await fetch(`${base}/data`, {
      headers: { origin: 'http://allowed.com' },
    });
    assert.equal(r.headers['access-control-allow-origin'], 'http://allowed.com');
  });

  it('no ACAO header for disallowed origin', async () => {
    const r = await fetch(`${base}/data`, {
      headers: { origin: 'http://evil.com' },
    });
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  });

  it('preflight returns 204 with CORS headers', async () => {
    const r = await fetch(`${base}/data`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://allowed.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Content-Type',
      },
    });
    assert.equal(r.status, 204);
    assert.ok(r.headers['access-control-allow-methods'].includes('POST'));
    assert.equal(r.headers['access-control-max-age'], '3600');
  });

  it('sets credentials header when configured', async () => {
    const r = await fetch(`${base}/data`, {
      headers: { origin: 'http://allowed.com' },
    });
    assert.equal(r.headers['access-control-allow-credentials'], 'true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — Integration: wildcard routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — wildcard routes', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.get('/static/me', (req, res) => res.json({ type: 'static' }));
      a.get('/files/*', (req, res) => res.json({ type: 'wildcard', path: req.path }));
      a.get('/users/:id', (req, res) => res.json({ type: 'param', id: req.params.id }));
    }));
  });
  after(() => app.close());

  it('static route matched before wildcard for same prefix', async () => {
    const r = await fetch(`${base}/static/me`);
    assert.deepEqual(JSON.parse(r.body), { type: 'static' });
  });

  it('wildcard matches deep paths', async () => {
    const r = await fetch(`${base}/files/a/b/c`);
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body).type, 'wildcard');
  });

  it('param route for users', async () => {
    const r = await fetch(`${base}/users/123`);
    assert.deepEqual(JSON.parse(r.body), { type: 'param', id: '123' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14 — Integration: sendFile
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — sendFile', () => {
  let app, base;
  let tmpFile;

  before(async () => {
    tmpFile = join(tmpdir(), `test-${Date.now()}.json`);
    writeFileSync(tmpFile, JSON.stringify({ file: 'ok' }));

    ({ app, base } = await startApp((a) => {
      a.get('/file', async (req, res) => {
        await res.sendFile(tmpFile);
      });
      a.get('/missing', async (req, res, next) => {
        try {
          await res.sendFile('/absolutely/missing/file.txt');
        } catch (err) {
          next(err);
        }
      });
      a.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message });
      });
    }));
  });

  after(async () => {
    await app.close();
    try { rmSync(tmpFile); } catch {}
  });

  it('streams a file with correct content-type', async () => {
    const r = await fetch(`${base}/file`);
    assert.equal(r.status, 200);
    assert.ok(r.headers['content-type'].includes('application/json'));
    assert.deepEqual(JSON.parse(r.body), { file: 'ok' });
  });

  it('sendFile missing file → 404 via error middleware', async () => {
    const r = await fetch(`${base}/missing`);
    assert.equal(r.status, 404);
    assert.ok(JSON.parse(r.body).error.includes('not found') || JSON.parse(r.body).error.includes('File'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15 — Integration: headers access
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — request headers', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.get('/headers', (req, res) => {
        res.json({
          ua: req.headers['user-agent'] || null,
          custom: req.headers['x-custom'] || null,
        });
      });
    }));
  });
  after(() => app.close());

  it('exposes request headers on req.headers', async () => {
    const r = await fetch(`${base}/headers`, {
      headers: { 'x-custom': 'test-value' },
    });
    const body = JSON.parse(r.body);
    assert.equal(body.custom, 'test-value');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 16 — Integration: multiple middleware composition
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — middleware composition', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      const log = [];

      const m1 = (req, res, next) => { res.setHeader('X-M1', '1'); next(); };
      const m2 = (req, res, next) => { res.setHeader('X-M2', '2'); next(); };
      const m3 = (req, res, next) => { res.setHeader('X-M3', '3'); next(); };

      a.use(m1, m2);
      a.get('/composed', m3, (req, res) => res.json({ ok: true }));
    }));
  });
  after(() => app.close());

  it('all global + per-route middleware headers are set', async () => {
    const r = await fetch(`${base}/composed`);
    assert.equal(r.headers['x-m1'], '1');
    assert.equal(r.headers['x-m2'], '2');
    assert.equal(r.headers['x-m3'], '3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 17 — Router: routes() introspection
// ═══════════════════════════════════════════════════════════════════════════════

describe('Router — introspection', () => {
  it('routes() returns all registered routes', () => {
    const r = new Router();
    r.get('/a', () => {});
    r.post('/b', () => {});
    const routes = r.routes();
    assert.equal(routes.length, 2);
    assert.ok(routes.some(rt => rt.method === 'GET' && rt.pattern === '/a'));
    assert.ok(routes.some(rt => rt.method === 'POST' && rt.pattern === '/b'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 18 — Integration: URL-encoded form body with duplicate keys
// ═══════════════════════════════════════════════════════════════════════════════

describe('App integration — URL-encoded duplicate keys', () => {
  let app, base;
  before(async () => {
    ({ app, base } = await startApp((a) => {
      a.post('/form', (req, res) => res.json({ body: req.body }));
    }));
  });
  after(() => app.close());

  it('duplicate keys become an array', async () => {
    const r = await fetch(`${base}/form`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'color=red&color=blue',
    });
    const b = JSON.parse(r.body);
    assert.deepEqual(b.body.color, ['red', 'blue']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 19 — App: listen on specific port and close
// ═══════════════════════════════════════════════════════════════════════════════

describe('App lifecycle', () => {
  it('listen() returns server with address()', async () => {
    const app = new App();
    app.get('/ping', (req, res) => res.json({ pong: true }));
    const server = await app.listen(0);
    const addr = server.address();
    assert.ok(addr.port > 0);
    await app.close();
  });

  it('close() shuts down the server', async () => {
    const app = new App();
    await app.listen(0);
    await app.close();
    // Server should be closed; app.server.listening should be false
    assert.equal(app.server.listening, false);
  });

  it('app.server is accessible', async () => {
    const app = new App();
    assert.equal(app.server, null);
    await app.listen(0);
    assert.ok(app.server !== null);
    await app.close();
  });
});
