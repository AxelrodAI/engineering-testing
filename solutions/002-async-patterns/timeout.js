/**
 * timeout.js — Wrap an async function with a timeout
 *
 * @module timeout
 */

/**
 * Wrap an async function so it rejects if it doesn't resolve within `ms` milliseconds.
 * The underlying function is still called; we just stop waiting for it after `ms`.
 * The timer is always cleaned up to prevent memory/handle leaks.
 *
 * @param {(...args: any[]) => Promise<any>} fn - The async function to wrap.
 * @param {number} ms - Timeout in milliseconds.
 * @param {object} [opts={}] - Options.
 * @param {string} [opts.message] - Custom timeout error message.
 * @param {AbortController} [opts.controller] - If provided, its signal is aborted on timeout
 *   so the inner function can honour cancellation.
 * @returns {(...args: any[]) => Promise<any>} - Wrapped function with identical signature.
 */
export function withTimeout(fn, ms, opts = {}) {
  if (typeof fn !== 'function') throw new TypeError('withTimeout: fn must be a function');
  if (typeof ms !== 'number' || ms <= 0) throw new RangeError('withTimeout: ms must be a positive number');

  const { message = null, controller = null } = opts;

  return async function timeoutWrapped(...args) {
    let timer;

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        // Optionally signal the inner fn to cancel
        if (controller) {
          try { controller.abort(); } catch { /* ignore */ }
        }
        const err = new Error(message ?? `Timed out after ${ms}ms`);
        err.name = 'TimeoutError';
        err.timeout = ms;
        reject(err);
      }, ms);
    });

    try {
      const result = await Promise.race([fn.apply(this, args), timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };
}

/**
 * Convenience: race a single already-started promise against a timeout.
 * Useful when you already have a promise in hand.
 *
 * @param {Promise<any>} promise - The promise to race.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} [message] - Custom error message.
 * @returns {Promise<any>}
 */
export function raceTimeout(promise, ms, message) {
  if (ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message ?? `Timed out after ${ms}ms`);
      err.name = 'TimeoutError';
      err.timeout = ms;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
