/**
 * Tests for Challenge 004: Micro HTTP Framework
 * Uses Node's built-in test runner + actual HTTP requests via fetch (Node 18+ built-in).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from './framework.js';
import { cors, bodyParser, staticFiles } from './middleware.js';
import { Router } from './router.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

async function withApp(setup, fn) {
  const app = createApp();
  setup(app);
  const server = await app.listen(0);
  const { port } = server.address();
  const base = `http://localhost:${port}`;
  try {
    await fn(base, app);
  } finally {
    await app.close();
  }
}

async function get(url, opts = {})    { return fetch(url, { method: 'GET', ...opts }); }
async function post(url, body, opts = {}) {
  const isJSON = body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body);
  return fetch(url, {
    method: 'POST',
    body: isJSON ? JSON.stringify(body) : body,
    headers: isJSON ? { 'Content-Type': 'application/json', ...(opts.headers||{}) } : (opts.headers||{}),
    ...opts,
  });
}
async function put(url, body, opts = {}) {
  const isJSON = body !== undefined && typeof body !== 'string';
  return fetch(url, {
    method: 'PUT',
    body: isJSON ? JSON.stringify(body) : body,
    headers: isJSON ? { 'Content-Type': 'application/json', ...(opts.headers||{}) } : (opts.headers||{}),
    ...opts,
  });
}
async function del(url, opts = {})   { return fetch(url, { method: 'DELETE', ...opts }); }
async function patch(url, body, opts = {}) {
  const isJSON = body !== undefined && typeof body !== 'string';
  return fetch(url, {
    method: 'PATCH',
    body: isJSON ? JSON.stringify(body) : body,
    headers: isJSON ? { 'Content-Type': 'application/json', ...(opts.headers||{}) } : (opts.headers||{}),
    ...opts,
  });
}

// ─── Router unit tests ────────────────────────────────────────────────────────

describe('Router', () => {
  test('matches exact paths', () => {
    const r = new Router();
    r.get('/hello', () => {});
    assert.ok(r.match('GET', '/hello'));
  });

  test('matches path params', () => {
    const r = new Router();
    r.get('/users/:id', () => {});
    const m = r.match('GET', '/users/42');
    assert.ok(m);
    assert.equal(m.params.id, '42');
  });

  test('matches multiple path params', () => {
    const r = new Router();
    r.get('/users/:userId/posts/:postId', () => {});
    const m = r.match('GET', '/users/10/posts/99');
    assert.ok(m);
    assert.equal(m.params.userId, '10');
    assert.equal(m.params.postId, '99');
  });

  test('matches wildcard', () => {
    const r = new Router();
    r.get('/files/*', () => {});
    assert.ok(r.match('GET', '/files/a/b/c.txt'));
  });

  test('returns null for unmatched path', () => {
    const r = new Router();
    r.get('/hello', () => {});
    assert.equal(r.match('GET', '/world'), null);
  });

  test('method not matched returns null', () => {
    const r = new Router();
    r.get('/hello', () => {});
    assert.equal(r.match('POST', '/hello'), null);
  });

  test('ALL method matches any HTTP method', () => {
    const r = new Router();
    r.all('/any', () => {});
    assert.ok(r.match('GET', '/any'));
    assert.ok(r.match('DELETE', '/any'));
    assert.ok(r.match('POST', '/any'));
  });

  test('optional trailing slash', () => {
    const r = new Router();
    r.get('/hello', () => {});
    assert.ok(r.match('GET', '/hello/'));
  });

  test('URL-decodes param values', () => {
    const r = new Router();
    r.get('/search/:query', () => {});
    const m = r.match('GET', '/search/hello%20world');
    assert.equal(m.params.query, 'hello world');
  });

  test('routes getter returns method+path list', () => {
    const r = new Router();
    r.get('/a', () => {});
    r.post('/b', () => {});
    const routes = r.routes;
    assert.equal(routes.length, 2);
    assert.equal(routes[0].method, 'GET');
    assert.equal(routes[1].path, '/b');
  });
});

// ─── HTTP methods ─────────────────────────────────────────────────────────────

describe('HTTP methods', () => {
  test('GET returns 200 + JSON', async () => {
    await withApp(app => {
      app.get('/ping', (req, res) => { res.json({ ok: true }); });
    }, async (base) => {
      const r = await get(`${base}/ping`);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
    });
  });

  test('POST returns 201 + body echo', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.post('/echo', (req, res) => { res.json(req.body, 201); });
    }, async (base) => {
      const r = await post(`${base}/echo`, { hello: 'world' });
      assert.equal(r.status, 201);
      assert.deepEqual(await r.json(), { hello: 'world' });
    });
  });

  test('PUT updates resource', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.put('/item/:id', (req, res) => {
        res.json({ id: req.params.id, ...req.body });
      });
    }, async (base) => {
      const r = await put(`${base}/item/7`, { name: 'updated' });
      assert.equal(r.status, 200);
      const data = await r.json();
      assert.equal(data.id, '7');
      assert.equal(data.name, 'updated');
    });
  });

  test('DELETE returns 204', async () => {
    await withApp(app => {
      app.delete('/item/:id', (req, res) => {
        res.statusCode = 204; res.end();
      });
    }, async (base) => {
      const r = await del(`${base}/item/5`);
      assert.equal(r.status, 204);
    });
  });

  test('PATCH partially updates', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.patch('/item/:id', (req, res) => {
        res.json({ id: req.params.id, patched: true, ...req.body });
      });
    }, async (base) => {
      const r = await patch(`${base}/item/3`, { status: 'active' });
      const data = await r.json();
      assert.equal(data.patched, true);
      assert.equal(data.status, 'active');
    });
  });
});

// ─── Params and query strings ─────────────────────────────────────────────────

describe('Params and query strings', () => {
  test('path params are parsed', async () => {
    await withApp(app => {
      app.get('/users/:userId/posts/:postId', (req, res) => { res.json(req.params); });
    }, async (base) => {
      const data = await (await get(`${base}/users/10/posts/42`)).json();
      assert.equal(data.userId, '10');
      assert.equal(data.postId, '42');
    });
  });

  test('query params are parsed', async () => {
    await withApp(app => {
      app.get('/search', (req, res) => { res.json(req.query); });
    }, async (base) => {
      const data = await (await get(`${base}/search?q=hello&limit=5`)).json();
      assert.equal(data.q, 'hello');
      assert.equal(data.limit, '5');
    });
  });

  test('wildcard captures the rest of the path', async () => {
    await withApp(app => {
      app.get('/files/*', (req, res) => { res.json({ path: req.pathname }); });
    }, async (base) => {
      const data = await (await get(`${base}/files/a/b/c.txt`)).json();
      assert.equal(data.path, '/files/a/b/c.txt');
    });
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────

describe('Middleware', () => {
  test('global middleware runs before route handler', async () => {
    const log = [];
    await withApp(app => {
      app.use((req, res, next) => { log.push('global'); next(); });
      app.get('/test', (req, res) => { log.push('route'); res.json({ log }); });
    }, async (base) => {
      const data = await (await get(`${base}/test`)).json();
      assert.deepEqual(data.log, ['global', 'route']);
    });
  });

  test('multiple global middleware run in order', async () => {
    const log = [];
    await withApp(app => {
      app.use((req, res, next) => { log.push(1); next(); });
      app.use((req, res, next) => { log.push(2); next(); });
      app.use((req, res, next) => { log.push(3); next(); });
      app.get('/test', (req, res) => { res.json({ log }); });
    }, async (base) => {
      const data = await (await get(`${base}/test`)).json();
      assert.deepEqual(data.log, [1, 2, 3]);
    });
  });

  test('middleware can short-circuit the chain', async () => {
    await withApp(app => {
      app.use((req, res, next) => {
        if (req.headers['x-blocked']) { res.statusCode = 403; res.end('blocked'); }
        else next();
      });
      app.get('/protected', (req, res) => { res.json({ ok: true }); });
    }, async (base) => {
      const r = await get(`${base}/protected`, { headers: { 'x-blocked': '1' } });
      assert.equal(r.status, 403);
    });
  });

  test('path-prefixed middleware only runs for matching paths', async () => {
    const log = [];
    await withApp(app => {
      app.use('/api', (req, res, next) => { log.push('api-mw'); next(); });
      app.get('/api/data', (req, res) => { res.json({ log }); });
      app.get('/other', (req, res) => { res.json({ log }); });
    }, async (base) => {
      log.length = 0;
      await get(`${base}/api/data`);
      assert.deepEqual(log, ['api-mw']);
      log.length = 0;
      await get(`${base}/other`);
      assert.deepEqual(log, []);
    });
  });

  test('per-route middleware runs only for that route', async () => {
    const log = [];
    const mw = (req, res, next) => { log.push('mw'); next(); };
    await withApp(app => {
      app.get('/a', mw, (req, res) => { res.json({ log }); });
      app.get('/b', (req, res) => { res.json({ log }); });
    }, async (base) => {
      log.length = 0;
      await get(`${base}/a`);
      assert.deepEqual(log, ['mw']);
      log.length = 0;
      await get(`${base}/b`);
      assert.deepEqual(log, []);
    });
  });

  test('async middleware is supported', async () => {
    await withApp(app => {
      app.use(async (req, res, next) => {
        await new Promise(r => setTimeout(r, 5));
        req.asyncDone = true;
        next();
      });
      app.get('/test', (req, res) => { res.json({ asyncDone: req.asyncDone }); });
    }, async (base) => {
      const data = await (await get(`${base}/test`)).json();
      assert.equal(data.asyncDone, true);
    });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('Error handling', () => {
  test('sync errors in route handler are caught', async () => {
    await withApp(app => {
      app.get('/boom', () => { throw new Error('sync boom'); });
    }, async (base) => {
      const r = await get(`${base}/boom`);
      assert.equal(r.status, 500);
    });
  });

  test('async errors in route handler are caught', async () => {
    await withApp(app => {
      app.get('/async-boom', async () => { throw new Error('async boom'); });
    }, async (base) => {
      const r = await get(`${base}/async-boom`);
      assert.equal(r.status, 500);
    });
  });

  test('error middleware receives the error', async () => {
    await withApp(app => {
      app.get('/fail', () => {
        const err = new Error('expected error'); err.status = 422; throw err;
      });
      app.use((err, req, res, next) => { res.status(err.status || 500).json({ message: err.message }); });
    }, async (base) => {
      const r = await get(`${base}/fail`);
      assert.equal(r.status, 422);
      const data = await r.json();
      assert.equal(data.message, 'expected error');
    });
  });

  test('next(err) routes to error middleware', async () => {
    await withApp(app => {
      app.use((req, res, next) => { next(new Error('middleware error')); });
      app.use((err, req, res, next) => { res.statusCode = 500; res.json({ caught: err.message }); });
      app.get('/test', (req, res) => { res.json({ ok: true }); });
    }, async (base) => {
      const data = await (await get(`${base}/test`)).json();
      assert.equal(data.caught, 'middleware error');
    });
  });

  test('unknown route returns 404 JSON', async () => {
    await withApp(app => {
      app.get('/exists', (req, res) => { res.json({ ok: true }); });
    }, async (base) => {
      const r = await get(`${base}/does-not-exist`);
      assert.equal(r.status, 404);
      assert.ok((await r.json()).error);
    });
  });
});

// ─── Response helpers ─────────────────────────────────────────────────────────

describe('Response helpers', () => {
  test('res.json() sends JSON with correct content-type', async () => {
    await withApp(app => {
      app.get('/json', (req, res) => { res.json({ x: 1 }); });
    }, async (base) => {
      const r = await get(`${base}/json`);
      assert.ok(r.headers.get('content-type').includes('application/json'));
      assert.deepEqual(await r.json(), { x: 1 });
    });
  });

  test('res.send() sends text/plain by default', async () => {
    await withApp(app => {
      app.get('/text', (req, res) => { res.send('hello'); });
    }, async (base) => {
      const r = await get(`${base}/text`);
      assert.ok(r.headers.get('content-type').includes('text/plain'));
      assert.equal(await r.text(), 'hello');
    });
  });

  test('res.status() sets status code', async () => {
    await withApp(app => {
      app.get('/created', (req, res) => { res.status(201).json({ created: true }); });
    }, async (base) => {
      const r = await get(`${base}/created`);
      assert.equal(r.status, 201);
    });
  });

  test('res.redirect() sends 302 with Location header', async () => {
    await withApp(app => {
      app.get('/old', (req, res) => { res.redirect('/new'); });
    }, async (base) => {
      const r = await get(`${base}/old`, { redirect: 'manual' });
      assert.ok([301, 302, 303, 307, 308].includes(r.status));
      assert.equal(r.headers.get('location'), '/new');
    });
  });

  test('res.redirect() accepts custom status code', async () => {
    await withApp(app => {
      app.get('/old', (req, res) => { res.redirect('/new', 301); });
    }, async (base) => {
      const r = await get(`${base}/old`, { redirect: 'manual' });
      assert.equal(r.status, 301);
    });
  });

  test('res.set() sets custom headers', async () => {
    await withApp(app => {
      app.get('/headers', (req, res) => { res.set('X-Custom', 'test-value').json({}); });
    }, async (base) => {
      const r = await get(`${base}/headers`);
      assert.equal(r.headers.get('x-custom'), 'test-value');
    });
  });
});

// ─── Body parsing ─────────────────────────────────────────────────────────────

describe('Body parsing', () => {
  test('JSON body is parsed automatically', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.post('/data', (req, res) => { res.json(req.body); });
    }, async (base) => {
      const data = await (await post(`${base}/data`, { key: 'value', num: 42 })).json();
      assert.equal(data.key, 'value');
      assert.equal(data.num, 42);
    });
  });

  test('form-urlencoded body is parsed', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.post('/form', (req, res) => { res.json(req.body); });
    }, async (base) => {
      const r = await fetch(`${base}/form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=Fred&age=30',
      });
      const data = await r.json();
      assert.equal(data.name, 'Fred');
      assert.equal(data.age, '30');
    });
  });

  test('text body is parsed as string', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.post('/text', (req, res) => { res.json({ body: req.body }); });
    }, async (base) => {
      const r = await fetch(`${base}/text`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello world',
      });
      const data = await r.json();
      assert.equal(data.body, 'hello world');
    });
  });

  test('invalid JSON returns 400', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.message }); });
      app.post('/data', (req, res) => { res.json(req.body); });
    }, async (base) => {
      const r = await fetch(`${base}/data`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{ invalid json',
      });
      assert.equal(r.status, 400);
    });
  });

  test('nested JSON objects are fully parsed', async () => {
    await withApp(app => {
      app.use(bodyParser());
      app.post('/nested', (req, res) => { res.json(req.body); });
    }, async (base) => {
      const payload = { user: { name: 'Alice', roles: ['admin', 'user'] } };
      const data = await (await post(`${base}/nested`, payload)).json();
      assert.deepEqual(data, payload);
    });
  });
});

// ─── CORS middleware ──────────────────────────────────────────────────────────

describe('CORS middleware', () => {
  test('wildcard origin sets ACAO: *', async () => {
    await withApp(app => {
      app.use(cors());
      app.get('/api', (req, res) => { res.json({}); });
    }, async (base) => {
      const r = await get(`${base}/api`, { headers: { Origin: 'http://example.com' } });
      assert.equal(r.headers.get('access-control-allow-origin'), '*');
    });
  });

  test('specific origin echoes matching origin', async () => {
    await withApp(app => {
      app.use(cors({ origins: ['http://allowed.com'] }));
      app.get('/api', (req, res) => { res.json({}); });
    }, async (base) => {
      const r = await get(`${base}/api`, { headers: { Origin: 'http://allowed.com' } });
      assert.equal(r.headers.get('access-control-allow-origin'), 'http://allowed.com');
    });
  });

  test('unmatched origin has no ACAO header', async () => {
    await withApp(app => {
      app.use(cors({ origins: ['http://allowed.com'] }));
      app.get('/api', (req, res) => { res.json({}); });
    }, async (base) => {
      const r = await get(`${base}/api`, { headers: { Origin: 'http://blocked.com' } });
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    });
  });

  test('OPTIONS preflight returns 204', async () => {
    await withApp(app => {
      app.use(cors());
      app.get('/api', (req, res) => { res.json({}); });
    }, async (base) => {
      const r = await fetch(`${base}/api`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'POST' },
      });
      assert.equal(r.status, 204);
      assert.ok(r.headers.get('access-control-allow-methods'));
    });
  });

  test('credentials mode sets Allow-Credentials', async () => {
    await withApp(app => {
      app.use(cors({ origins: 'http://trusted.com', credentials: true }));
      app.get('/api', (req, res) => { res.json({}); });
    }, async (base) => {
      const r = await get(`${base}/api`, { headers: { Origin: 'http://trusted.com' } });
      assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
    });
  });
});

// ─── Static file serving ──────────────────────────────────────────────────────

describe('Static file serving', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-static-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<h1>Hello</h1>');
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body { color: red }');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"test":true}');
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'page.html'), '<p>Sub</p>');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('serves CSS file with correct MIME type', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const r = await get(`${base}/style.css`);
      assert.equal(r.status, 200);
      assert.ok(r.headers.get('content-type').includes('text/css'));
    });
  });

  test('serves JSON file', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const r = await get(`${base}/data.json`);
      assert.equal(r.status, 200);
      assert.equal((await r.json()).test, true);
    });
  });

  test('serves index.html for directory request', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const text = await (await get(`${base}/`)).text();
      assert.ok(text.includes('Hello'));
    });
  });

  test('serves files in subdirectories', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const text = await (await get(`${base}/sub/page.html`)).text();
      assert.ok(text.includes('Sub'));
    });
  });

  test('returns 404 for non-existent file', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const r = await get(`${base}/notfound.txt`);
      assert.equal(r.status, 404);
    });
  });

  test('prevents path traversal', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const r = await get(`${base}/../../etc/passwd`);
      assert.ok([403, 404].includes(r.status));
    });
  });

  test('HEAD request returns headers without body', async () => {
    await withApp(app => {
      app.use(staticFiles(tmpDir));
    }, async (base) => {
      const r = await fetch(`${base}/index.html`, { method: 'HEAD' });
      assert.equal(r.status, 200);
      assert.ok(r.headers.get('content-length'));
    });
  });
});

// ─── App composition ──────────────────────────────────────────────────────────

describe('App composition', () => {
  test('multiple routes registered independently', async () => {
    await withApp(app => {
      app.get('/a', (req, res) => { res.json({ route: 'a' }); });
      app.get('/b', (req, res) => { res.json({ route: 'b' }); });
      app.get('/c', (req, res) => { res.json({ route: 'c' }); });
    }, async (base) => {
      const [ra, rb, rc] = await Promise.all([
        get(`${base}/a`).then(r => r.json()),
        get(`${base}/b`).then(r => r.json()),
        get(`${base}/c`).then(r => r.json()),
      ]);
      assert.equal(ra.route, 'a');
      assert.equal(rb.route, 'b');
      assert.equal(rc.route, 'c');
    });
  });

  test('app.routes returns list of registered routes', async () => {
    await withApp(app => {
      app.get('/x', () => {});
      app.post('/y', () => {});
    }, async (base, app) => {
      const routes = app.routes;
      assert.ok(routes.some(r => r.method === 'GET' && r.path === '/x'));
      assert.ok(routes.some(r => r.method === 'POST' && r.path === '/y'));
    });
  });

  test('concurrent requests are handled correctly', async () => {
    await withApp(app => {
      app.get('/delay/:ms', async (req, res) => {
        await new Promise(r => setTimeout(r, parseInt(req.params.ms)));
        res.json({ delayed: parseInt(req.params.ms) });
      });
    }, async (base) => {
      const [r50, r10, r30] = await Promise.all([
        get(`${base}/delay/50`).then(r => r.json()),
        get(`${base}/delay/10`).then(r => r.json()),
        get(`${base}/delay/30`).then(r => r.json()),
      ]);
      assert.equal(r50.delayed, 50);
      assert.equal(r10.delayed, 10);
      assert.equal(r30.delayed, 30);
    });
  });
});

// ─── Benchmark ────────────────────────────────────────────────────────────────

describe('Benchmark', () => {
  test('handles 1000 sequential requests without error', async () => {
    await withApp(app => {
      app.get('/bench', (req, res) => { res.json({ ok: true }); });
    }, async (base) => {
      let failures = 0;
      for (let i = 0; i < 1000; i++) {
        if ((await get(`${base}/bench`)).status !== 200) failures++;
      }
      assert.equal(failures, 0);
    });
  });

  test('throughput: 1000 concurrent requests complete within 30s', async () => {
    await withApp(app => {
      app.get('/bench', (req, res) => { res.json({ ok: true }); });
    }, async (base) => {
      const N = 1000;
      const BATCH = 50;
      let failures = 0;
      const start = Date.now();
      for (let i = 0; i < N; i += BATCH) {
        const batch = Array.from({ length: Math.min(BATCH, N - i) }, () =>
          get(`${base}/bench`).then(r => r.status !== 200 && failures++)
        );
        await Promise.all(batch);
      }
      const elapsed = Date.now() - start;
      assert.equal(failures, 0);
      assert.ok(elapsed < 30000, `Took ${elapsed}ms`);
      console.log(`  Benchmark: ${N} requests in ${elapsed}ms (${(N/elapsed*1000).toFixed(0)} req/s)`);
    });
  });
});
