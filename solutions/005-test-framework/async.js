// async.js — Async test support with configurable timeout

export const DEFAULT_TIMEOUT = 5000; // ms

/**
 * Run a test function with a timeout.
 * Returns a promise that rejects if the test exceeds the timeout.
 */
export async function runWithTimeout(fn, timeoutMs = DEFAULT_TIMEOUT) {
  if (timeoutMs <= 0) {
    // No timeout
    return await fn();
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Test timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Handle both sync and async functions
    let result;
    try {
      result = fn();
    } catch (err) {
      clearTimeout(timer);
      settled = true;
      reject(err);
      return;
    }

    if (result && typeof result.then === 'function') {
      // Async function
      result.then(
        (val) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(val);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      );
    } else {
      // Sync function
      clearTimeout(timer);
      settled = true;
      resolve(result);
    }
  });
}

/**
 * Check if a function is async (returns a Promise).
 */
export function isAsync(fn) {
  if (!fn) return false;
  return fn.constructor?.name === 'AsyncFunction' || fn.toString().startsWith('async');
}

/**
 * Wrap any function to always return a Promise.
 */
export function toAsync(fn) {
  return async (...args) => fn(...args);
}
