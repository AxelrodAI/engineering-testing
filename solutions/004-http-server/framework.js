/**
 * Micro HTTP Framework — Express-like API on raw Node http.
 * Dependencies: Node built-ins only.
 */
import http from 'node:http';
import { Router } from './router.js';
import { wrapRequest } from './request.js';
import { wrapResponse } from './response.js';

export class App {
  #globalMiddleware = [];   // app.use() handlers (no path or with path prefix)
  #router = new Router();
  #errorHandlers = [];      // 4-arity (err, req, res, next) handlers
  #server = null;

  // ── Delegation to the router ──────────────────────────────────────────────
  get(path, ...handlers)    { this.#router.get(path, ...handlers);    return this; }
  post(path, ...handlers)   { this.#router.post(path, ...handlers);   return this; }
  put(path, ...handlers)    { this.#router.put(path, ...handlers);    return this; }
  delete(path, ...handlers) { this.#router.delete(path, ...handlers); return this; }
  patch(path, ...handlers)  { this.#router.patch(path, ...handlers);  return this; }
  all(path, ...handlers)    { this.#router.all(path, ...handlers);    return this; }

  /**
   * app.use([path], ...fns)
   *   - 4-arity fns → error middleware
   *   - otherwise → global middleware (optionally path-prefixed)
   */
  use(pathOrFn, ...rest) {
    let prefix = null;
    let fns;

    if (typeof pathOrFn === 'string') {
      prefix = pathOrFn;
      fns = rest;
    } else {
      fns = [pathOrFn, ...rest];
    }

    for (const fn of fns) {
      if (fn.length === 4) {
        this.#errorHandlers.push({ prefix, fn });
      } else {
        this.#globalMiddleware.push({ prefix, fn });
      }
    }
    return this;
  }

  // ── Request dispatch ──────────────────────────────────────────────────────
  #dispatch(req, res) {
    wrapResponse(res);
    wrapRequest(req);

    const pathname = req.pathname;
    const method   = req.method;

    // Collect all applicable handlers in order:
    //   1. global middleware (filtered by path prefix)
    //   2. matched route handlers
    const chain = [];

    for (const { prefix, fn } of this.#globalMiddleware) {
      if (!prefix || pathname.startsWith(prefix)) {
        chain.push(fn);
      }
    }

    const match = this.#router.match(method, pathname);
    if (match) {
      req.params = match.params;
      chain.push(...match.handlers);
    } else {
      // 404 at end of chain
      chain.push((_req, _res) => {
        _res.statusCode = 404;
        _res.setHeader('Content-Type', 'application/json');
        _res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
      });
    }

    // Error handlers are separate — only invoked via next(err)
    const errorChain = this.#errorHandlers.filter(
      ({ prefix }) => !prefix || pathname.startsWith(prefix)
    ).map(e => e.fn);

    this.#run(chain, errorChain, req, res);
  }

  #run(chain, errorChain, req, res, idx = 0) {
    if (idx >= chain.length) return;

    const handler = chain[idx];
    const next = (err) => {
      if (err) {
        this.#runError(err, errorChain, req, res, 0);
      } else {
        this.#run(chain, errorChain, req, res, idx + 1);
      }
    };

    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(err => this.#runError(err, errorChain, req, res, 0));
      }
    } catch (err) {
      this.#runError(err, errorChain, req, res, 0);
    }
  }

  #runError(err, chain, req, res, idx) {
    if (idx >= chain.length) {
      // Default error handler
      const status = err.status || err.statusCode || 500;
      if (!res.headersSent) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
      return;
    }

    const handler = chain[idx];
    const next = (e) => this.#runError(e || err, chain, req, res, idx + 1);

    try {
      const result = handler(err, req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(e => this.#runError(e, chain, req, res, idx + 1));
      }
    } catch (e) {
      this.#runError(e, chain, req, res, idx + 1);
    }
  }

  // ── Server lifecycle ──────────────────────────────────────────────────────
  listen(port, hostname, callback) {
    if (typeof hostname === 'function') { callback = hostname; hostname = undefined; }
    this.#server = http.createServer((req, res) => this.#dispatch(req, res));
    return new Promise((resolve, reject) => {
      this.#server.listen(port, hostname, (err) => {
        if (err) { reject(err); return; }
        if (callback) callback(this.#server.address());
        resolve(this.#server);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (!this.#server) { resolve(); return; }
      this.#server.close(err => err ? reject(err) : resolve());
    });
  }

  /** Expose the underlying http.Server (e.g. for supertest / get address). */
  get server() { return this.#server; }

  /** Expose router list for debugging. */
  get routes() { return this.#router.routes; }
}

/** Factory — matches Express's export style. */
export function createApp() {
  return new App();
}
