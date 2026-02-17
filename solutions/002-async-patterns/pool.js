/**
 * pool.js — Concurrent task pool with max concurrency limit
 *
 * @module pool
 */

/**
 * Run an array of async task-factory functions with a concurrency cap.
 * Results are returned in the same order as tasks, regardless of completion order.
 * If any task throws, remaining running tasks are still awaited before the error
 * is re-thrown (wrapped in AggregateError if multiple tasks failed).
 *
 * @param {Array<() => Promise<any>>} tasks - Array of zero-arg async functions.
 * @param {number} [concurrency=Infinity] - Max simultaneous tasks.
 * @param {object} [opts={}] - Options.
 * @param {AbortSignal} [opts.signal] - Abort running; queued tasks are skipped.
 * @param {(completed: number, total: number) => void} [opts.onProgress] - Progress callback.
 * @returns {Promise<any[]>} - Resolves with results array in original task order.
 */
export async function pool(tasks, concurrency = Infinity, opts = {}) {
  if (!Array.isArray(tasks)) throw new TypeError('pool: tasks must be an array');
  if (tasks.length === 0) return [];

  const { signal = null, onProgress = null } = opts;

  const cap = concurrency < 1 ? 1 : Math.floor(concurrency);
  const results = new Array(tasks.length);
  const errors = [];
  let taskIndex = 0;
  let completed = 0;
  const total = tasks.length;

  async function worker() {
    while (taskIndex < total) {
      if (signal?.aborted) break;

      const idx = taskIndex++;
      const fn = tasks[idx];

      if (typeof fn !== 'function') {
        errors.push(new TypeError(`pool: task[${idx}] is not a function`));
        completed++;
        if (typeof onProgress === 'function') onProgress(completed, total);
        continue;
      }

      try {
        results[idx] = await fn();
      } catch (err) {
        // Tag the error with its index for ordering info
        err._poolIndex = idx;
        errors.push(err);
      }

      completed++;
      if (typeof onProgress === 'function') onProgress(completed, total);
    }
  }

  const workerCount = Math.min(cap, total);
  const workers = Array.from({ length: workerCount }, worker);
  await Promise.all(workers);

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    const agg = new AggregateError(errors, `pool: ${errors.length} tasks failed`);
    throw agg;
  }

  return results;
}
