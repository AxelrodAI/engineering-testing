/**
 * retry.js — Exponential backoff retry utility
 *
 * @module retry
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async function with exponential backoff.
 *
 * @param {() => Promise<any>} fn - Async function to retry (receives attempt index).
 * @param {object} [opts={}] - Options.
 * @param {number} [opts.retries=3] - Maximum number of retry attempts (not counting the first call).
 * @param {number} [opts.delay=100] - Base delay in ms between retries.
 * @param {number} [opts.factor=2] - Exponential backoff multiplier.
 * @param {number} [opts.maxDelay=Infinity] - Cap on the computed delay.
 * @param {number} [opts.jitter=0] - Random jitter added (0–jitter ms) to each delay.
 * @param {(err: Error) => boolean} [opts.filter] - Return false to abort retrying immediately.
 * @param {(err: Error, attempt: number) => void} [opts.onRetry] - Called before each retry.
 * @param {AbortSignal} [opts.signal] - AbortSignal; if aborted, stops retrying immediately.
 * @returns {Promise<any>}
 */
export async function retry(fn, opts = {}) {
  const {
    retries = 3,
    delay = 100,
    factor = 2,
    maxDelay = Infinity,
    jitter = 0,
    filter = null,
    onRetry = null,
    signal = null,
  } = opts;

  if (typeof fn !== 'function') throw new TypeError('retry: fn must be a function');
  if (retries < 0) throw new RangeError('retry: retries must be >= 0');

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Abort check before each attempt
    if (signal?.aborted) {
      const err = new Error('retry: aborted');
      err.name = 'AbortError';
      throw err;
    }

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      // Don't retry if this is the last attempt
      if (attempt === retries) break;

      // Don't retry if the filter says so
      if (filter !== null && !filter(err)) throw err;

      // Compute backoff delay
      const backoff = Math.min(delay * Math.pow(factor, attempt), maxDelay);
      const wait = backoff + (jitter > 0 ? Math.random() * jitter : 0);

      if (typeof onRetry === 'function') onRetry(err, attempt + 1);

      // Abortable sleep
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            const abortErr = new Error('retry: aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          };
          if (signal.aborted) { onAbort(); return; }
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }

  throw lastError;
}
