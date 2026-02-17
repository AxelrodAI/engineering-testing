/**
 * @fileoverview Main framework class — wires router, middleware, request/response helpers.
 * @module app
 */

import { createServer } from 'node:http';
import { Router } from './router.js';
import { MiddlewareManager, runMiddleware } from './middleware.js';
import { enhanceRequest, parseBody } from './request.js';
import { enhanceResponse } from './response.js';

/**
 * Micro HTTP Framework — Express-like API on top of Node's built-in http module.
 *
 * @example
 * import { App } from './app.js';
 * const app = new App();
 * app.get('/hello', (req, res) => res.json({ hello: 'world' }));
 * app.listen(3000);
 */
export class App {
  #router = new Router();
  #middleware = new MiddlewareManager();
  #server = null;

  // ─── Global middleware ─────────────────────────────────────────────────────

  /**
   * Add global middleware (runs before every request).
   * Also accepts error middleware (4-arg functions).
   * @param {...Function} fns
   * @returns {this}
   */
  use(...fns) {
    this.#middleware.use(...fns);
    return this;
  }

  // ─── Route registration ────────────────────────────────────────────────────

  /**
   * Register a GET route.
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  get(path, ...handlers) { this.#router.get(path, ...handlers); return this; }

  /**
   * Register a POST route.
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  post(path, ...handlers) { this.#router.post(path, ...handlers); return this; }

  /**
   * Register a PUT route.
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  put(path, ...handlers) { this.#router.put(path, ...handlers); return this; }

  /**
   * Register a DELETE route.
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  delete(path, ...handlers) { this.#router.delete(path, ...handlers); return this; }

  /**
   * Register a PATCH route.
   * @param {string} path
   * @param {...Function} handlers
   * @returns {this}
   */
  patch(path, ...handlers) { this.#router.patch(path, ...handlers); return this; }

  // ─── Request handling ──────────────────────────────────────────────────────

  /**
   * Main request handler — called by the HTTP server for each request.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async #handleRequest(req, res) {
    // Enhance request and response with helpers
    enhanceRequest(req);
    enhanceResponse(res);

    // Parse body (async — reads stream)
    await parseBody(req);

    // Match route
    const match = this.#router.match(req.method, req.path);

    let stack;
    if (match) {
      // Inject path params
      req.params = match.params;
      stack = this.#middleware.buildStack(match.handlers);
    } else {
      // 404 handler at the end of the global middleware
      stack = this.#middleware.buildStack([defaultNotFound]);
    }

    try {
      await runMiddleware(stack, req, res);
    } catch (err) {
      // Unhandled error fell out of the middleware chain
      if (!res.headersSent) {
        res.statusCode = err.status || 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: err.message || 'Internal Server Error',
        }));
      }
    }

    // If nothing sent a response yet, send a minimal 404
    if (!res.headersSent) {
      res.statusCode = 404;
      res.end('Not Found');
    }
  }

  // ─── Server lifecycle ──────────────────────────────────────────────────────

  /**
   * Start listening on the given port (and optional hostname).
   * @param {number} [port=0] - Port number; 0 = OS-assigned random port
   * @param {string} [hostname='0.0.0.0']
   * @returns {Promise<import('node:http').Server>} Resolves when server is listening
   */
  listen(port = 0, hostname = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.#server = createServer((req, res) => {
        this.#handleRequest(req, res).catch((err) => {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end('Internal Server Error');
          }
        });
      });

      this.#server.on('error', reject);
      this.#server.listen(port, hostname, () => resolve(this.#server));
    });
  }

  /**
   * Stop the HTTP server gracefully.
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve, reject) => {
      if (!this.#server) return resolve();
      this.#server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Expose the underlying http.Server (useful for tests / port access).
   * @returns {import('node:http').Server | null}
   */
  get server() {
    return this.#server;
  }
}

// ─── Built-in 404 handler ────────────────────────────────────────────────────

/**
 * Default not-found handler — used when no route matches.
 * @param {object} req
 * @param {object} res
 */
function defaultNotFound(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Not Found', path: req.path }));
}
