/**
 * @fileoverview Middleware chain — global use(), per-route, error middleware (4-arg), next().
 * @module middleware
 */

/**
 * Execute a stack of middleware in order.
 * Regular middleware: (req, res, next)
 * Error middleware:   (err, req, res, next)  [detected by fn.length === 4]
 *
 * @param {Function[]} stack
 * @param {object} req
 * @param {object} res
 * @param {Error|null} [initialErr]
 * @returns {Promise<void>}
 */
export function runMiddleware(stack, req, res, initialErr = null) {
  return new Promise((resolve, reject) => {
    let index = 0;
    let currentErr = initialErr;

    function next(err) {
      currentErr = err !== undefined ? err : null;
      if (index >= stack.length) { resolve(); return; }
      const fn = stack[index++];
      try {
        if (currentErr) {
          if (fn.length === 4) {
            fn(currentErr, req, res, next);
          } else {
            next(currentErr); // skip regular middleware when in error mode
          }
        } else {
          if (fn.length === 4) {
            next(); // skip error middleware in normal flow
          } else {
            fn(req, res, next);
          }
        }
      } catch (thrownErr) {
        next(thrownErr);
      }
    }

    next(initialErr || undefined);
  });
}

/**
 * Middleware manager — collects global middleware and builds combined stacks.
 */
export class MiddlewareManager {
  #global = [];

  /**
   * Add global middleware (runs for every request).
   * @param {...Function} fns
   * @returns {this}
   */
  use(...fns) {
    this.#global.push(...fns);
    return this;
  }

  /**
   * Build the full stack: global → route-specific handlers.
   * @param {Function[]} routeHandlers
   * @returns {Function[]}
   */
  buildStack(routeHandlers) {
    return [...this.#global, ...routeHandlers];
  }

  /**
   * Return global middleware (for testing).
   * @returns {Function[]}
   */
  globals() { return [...this.#global]; }
}
