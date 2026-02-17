/**
 * debounce.js — Async-safe debounce
 *
 * @module debounce
 */

/**
 * Create an async-safe debounced version of `fn`.
 *
 * All calls within the debounce window share the same returned Promise.
 * When the timer fires, the function is called with the LAST set of arguments
 * and all callers from that window resolve/reject together.
 *
 * After that call settles, the next call starts a fresh window.
 *
 * @param {(...args: any[]) => Promise<any>} fn - The async function to debounce.
 * @param {number} ms - Debounce delay in milliseconds.
 * @param {object} [opts={}] - Options.
 * @param {boolean} [opts.leading=false] - Fire on the leading edge instead of trailing.
 * @returns {DebouncedFn}
 *
 * @typedef {Object} DebouncedFn
 * @property {(...args: any[]) => Promise<any>} call - Invoke the debounced function.
 * @property {() => void} cancel - Cancel any pending invocation (pending promises are rejected).
 * @property {() => Promise<any>} flush - Immediately invoke if pending, skipping the timer.
 * @property {() => boolean} isPending - Returns true if a timer is active.
 */
export function debounce(fn, ms, opts = {}) {
  if (typeof fn !== 'function') throw new TypeError('debounce: fn must be a function');
  if (typeof ms !== 'number' || ms < 0) throw new RangeError('debounce: ms must be >= 0');

  const { leading = false } = opts;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  /** Shared state for the current debounce window. */
  let window = null;

  function createWindow(args) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { args, promise, resolve, reject };
  }

  async function invoke(win) {
    try {
      win.resolve(await fn(...win.args));
    } catch (err) {
      win.reject(err);
    } finally {
      // If this window is still the active one, clear it
      if (window === win) window = null;
    }
  }

  /**
   * Call the debounced function. Returns a Promise that resolves/rejects
   * when this debounce window's invocation settles.
   *
   * @param {...any} args
   * @returns {Promise<any>}
   */
  function debouncedFn(...args) {
    if (leading) {
      // Leading edge: fire immediately on first call, suppress subsequent calls in window
      if (!window) {
        window = createWindow(args);
        // Invoke immediately (before starting timer)
        invoke(window);
      } else {
        // Update args for the window (leading: first call's args take precedence, or update?)
        // Standard leading debounce: update args but don't fire again until window closes
        window.args = args;
      }

      // Clear any previous timer
      if (timer) clearTimeout(timer);

      const win = window;
      timer = setTimeout(() => {
        timer = null;
        window = null; // Close the window so next call fires immediately
      }, ms);

      return win.promise;
    }

    // Trailing edge (default): fire after the last call in the window
    if (!window) {
      window = createWindow(args);
    } else {
      // Update to the latest args — trailing debounce uses last-call args
      window.args = args;
    }

    if (timer) clearTimeout(timer);

    const win = window;
    timer = setTimeout(() => {
      timer = null;
      invoke(win);
    }, ms);

    return win.promise;
  }

  /**
   * Cancel any pending debounced invocation.
   * Callers awaiting the current window's promise will receive a rejection.
   */
  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (window) {
      const err = new Error('debounce: cancelled');
      err.name = 'CancelError';
      window.reject(err);
      window = null;
    }
  }

  /**
   * Immediately fire the pending invocation (if any), bypassing the remaining timer delay.
   * If nothing is pending, returns a resolved Promise with undefined.
   *
   * @returns {Promise<any>}
   */
  function flush() {
    if (!window) return Promise.resolve(undefined);

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const win = window;
    invoke(win);
    return win.promise;
  }

  /**
   * @returns {boolean} True if a timer is currently active.
   */
  function isPending() {
    return timer !== null;
  }

  return { call: debouncedFn, cancel, flush, isPending };
}
