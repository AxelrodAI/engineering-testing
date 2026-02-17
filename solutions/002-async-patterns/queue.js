/**
 * queue.js — Task queue with concurrency, drain, pause, resume
 *
 * @module queue
 */

/**
 * Create a task queue that runs up to `concurrency` tasks simultaneously.
 *
 * @param {number} [concurrency=1] - Max simultaneous tasks.
 * @returns {TaskQueue}
 *
 * @typedef {Object} TaskQueue
 * @property {(fn: () => Promise<any>) => Promise<any>} add - Enqueue a task.
 * @property {() => Promise<void>} drain - Resolve when queue is empty and all tasks settled.
 * @property {() => void} pause - Pause processing (in-flight tasks still finish).
 * @property {() => void} resume - Resume processing.
 * @property {() => void} clear - Remove all pending (not yet started) tasks.
 * @property {number} size - Number of tasks waiting to start.
 * @property {number} pending - Number of tasks currently running.
 * @property {boolean} paused - Whether the queue is paused.
 */
export function createQueue(concurrency = 1) {
  if (typeof concurrency !== 'number' || concurrency < 1) {
    throw new RangeError('createQueue: concurrency must be >= 1');
  }
  concurrency = Math.floor(concurrency);

  /** @type {{ fn: Function, resolve: Function, reject: Function }[]} */
  let tasks = [];
  let running = 0;
  let paused = false;

  /** Promises waiting for the drain event. */
  let drainResolvers = [];

  function checkDrain() {
    if (running === 0 && tasks.length === 0) {
      for (const resolve of drainResolvers) resolve();
      drainResolvers = [];
    }
  }

  function tick() {
    if (paused) return;
    while (running < concurrency && tasks.length > 0) {
      const { fn, resolve, reject } = tasks.shift();
      running++;

      // Start the task without awaiting — we drive concurrency manually
      Promise.resolve()
        .then(() => fn())
        .then(
          (result) => {
            running--;
            resolve(result);
            tick();
            checkDrain();
          },
          (err) => {
            running--;
            reject(err);
            tick();         // keep processing; one failure doesn't stop the queue
            checkDrain();
          }
        );
    }
  }

  const queue = {
    /**
     * Add a task to the queue.
     * @param {() => Promise<any>} fn - Zero-arg async function.
     * @returns {Promise<any>} Resolves/rejects with the task's result.
     */
    add(fn) {
      if (typeof fn !== 'function') return Promise.reject(new TypeError('queue.add: fn must be a function'));
      return new Promise((resolve, reject) => {
        tasks.push({ fn, resolve, reject });
        tick();
      });
    },

    /**
     * Returns a Promise that resolves when the queue is fully empty (no tasks waiting
     * and no tasks running). If already empty, resolves immediately.
     *
     * @returns {Promise<void>}
     */
    drain() {
      if (running === 0 && tasks.length === 0) return Promise.resolve();
      return new Promise((resolve) => drainResolvers.push(resolve));
    },

    /**
     * Pause the queue. In-flight tasks continue to completion,
     * but no new tasks are dequeued until resume() is called.
     */
    pause() {
      paused = true;
    },

    /**
     * Resume a paused queue.
     */
    resume() {
      if (!paused) return;
      paused = false;
      tick();
    },

    /**
     * Remove all pending (not yet started) tasks from the queue.
     * Their promises are rejected with a CancelError.
     */
    clear() {
      const cancelled = tasks.splice(0);
      for (const { reject } of cancelled) {
        const err = new Error('queue: task cancelled via clear()');
        err.name = 'CancelError';
        reject(err);
      }
    },

    /** @returns {number} Number of tasks waiting to start. */
    get size() { return tasks.length; },

    /** @returns {number} Number of tasks currently running. */
    get pending() { return running; },

    /** @returns {boolean} */
    get paused() { return paused; },
  };

  return queue;
}
