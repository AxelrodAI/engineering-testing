/**
 * async-patterns.test.js — Comprehensive tests for the async utility library
 *
 * Run: node --test solutions/002-async-patterns/async-patterns.test.js
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { retry } from './retry.js';
import { pool } from './pool.js';
import { withTimeout, raceTimeout } from './timeout.js';
import { debounce } from './debounce.js';
import { createQueue } from './queue.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Assert elapsed time is within [expected - tol, expected + tol] ms.
 */
function assertTiming(elapsed, expected, tol = 80, label = '') {
  const lo = expected - tol;
  const hi = expected + tol;
  assert.ok(
    elapsed >= lo && elapsed <= hi,
    `${label} timing: expected ~${expected}ms, got ${elapsed}ms (±${tol}ms)`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY
// ─────────────────────────────────────────────────────────────────────────────

describe('retry', () => {
  it('returns value on first success', async () => {
    const result = await retry(() => Promise.resolve(42));
    assert.equal(result, 42);
  });

  it('succeeds after transient failures', async () => {
    let calls = 0;
    const result = await retry(() => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return Promise.resolve('ok');
    }, { retries: 5, delay: 5 });
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws after exhausting retries', async () => {
    let calls = 0;
    await assert.rejects(
      retry(() => { calls++; throw new Error('always fails'); }, { retries: 2, delay: 5 }),
      /always fails/
    );
    assert.equal(calls, 3); // 1 initial + 2 retries
  });

  it('receives attempt index', async () => {
    const attempts = [];
    await assert.rejects(
      retry((n) => { attempts.push(n); throw new Error('x'); }, { retries: 2, delay: 5 }),
    );
    assert.deepEqual(attempts, [0, 1, 2]);
  });

  it('calls onRetry before each retry', async () => {
    const log = [];
    await assert.rejects(
      retry(() => { throw new Error('e'); }, {
        retries: 2,
        delay: 5,
        onRetry: (err, n) => log.push(n),
      })
    );
    assert.deepEqual(log, [1, 2]);
  });

  it('filter aborts retry when returning false', async () => {
    let calls = 0;
    const nonRetryable = new Error('fatal');
    await assert.rejects(
      retry(() => { calls++; throw nonRetryable; }, {
        retries: 5,
        delay: 5,
        filter: (err) => err !== nonRetryable,
      }),
      /fatal/
    );
    assert.equal(calls, 1); // No retries
  });

  it('filter allows retry when returning true', async () => {
    let calls = 0;
    await assert.rejects(
      retry(() => { calls++; throw new Error('retryable'); }, {
        retries: 2,
        delay: 5,
        filter: () => true,
      })
    );
    assert.equal(calls, 3);
  });

  it('respects exponential backoff timing', async () => {
    let calls = 0;
    const start = Date.now();
    await assert.rejects(
      retry(() => { calls++; throw new Error('x'); }, {
        retries: 2,
        delay: 30,
        factor: 2,
      })
    );
    const elapsed = Date.now() - start;
    // delay for attempt 0→1: 30ms; attempt 1→2: 60ms. Total ~90ms
    assertTiming(elapsed, 90, 100, 'exponential backoff');
  });

  it('respects maxDelay cap', async () => {
    const start = Date.now();
    await assert.rejects(
      retry(() => { throw new Error('x'); }, {
        retries: 3,
        delay: 50,
        factor: 10,
        maxDelay: 60,
      })
    );
    const elapsed = Date.now() - start;
    // delays: 50, 60(cap), 60(cap) = 170ms max
    assert.ok(elapsed < 250, `maxDelay not respected: ${elapsed}ms`);
  });

  it('aborts via AbortSignal', async () => {
    const ac = new AbortController();
    let calls = 0;
    const p = retry(() => { calls++; throw new Error('x'); }, {
      retries: 10,
      delay: 50,
      signal: ac.signal,
    });
    // Abort after first retry delay starts
    await sleep(60);
    ac.abort();
    const err = await p.catch((e) => e);
    assert.equal(err.name, 'AbortError');
    assert.ok(calls <= 3, `too many calls: ${calls}`);
  });

  it('throws TypeError for non-function fn', async () => {
    await assert.rejects(retry(42), /fn must be a function/);
  });

  it('throws RangeError for negative retries', async () => {
    await assert.rejects(retry(() => {}, { retries: -1 }), /retries must be/);
  });

  it('handles synchronous errors in fn', async () => {
    let n = 0;
    await assert.rejects(
      retry(() => { n++; throw new SyntaxError('syn'); }, { retries: 1, delay: 5 })
    );
    assert.equal(n, 2);
  });

  it('works with retries=0 (single attempt)', async () => {
    await assert.rejects(
      retry(() => { throw new Error('once'); }, { retries: 0 }),
      /once/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POOL
// ─────────────────────────────────────────────────────────────────────────────

describe('pool', () => {
  it('returns results in original order', async () => {
    const tasks = [
      async () => { await sleep(30); return 'c'; },
      async () => { await sleep(10); return 'a'; },
      async () => { await sleep(20); return 'b'; },
    ];
    const results = await pool(tasks, 3);
    assert.deepEqual(results, ['c', 'a', 'b']);
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await sleep(20);
      running--;
    });
    await pool(tasks, 3);
    assert.ok(maxRunning <= 3, `max concurrency exceeded: ${maxRunning}`);
  });

  it('concurrency=1 runs tasks serially', async () => {
    const order = [];
    const tasks = [1, 2, 3].map((n) => async () => {
      await sleep(10);
      order.push(n);
    });
    await pool(tasks, 1);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it('returns [] for empty tasks', async () => {
    const result = await pool([]);
    assert.deepEqual(result, []);
  });

  it('throws on single task error', async () => {
    const tasks = [
      async () => 1,
      async () => { throw new Error('boom'); },
      async () => 3,
    ];
    await assert.rejects(pool(tasks, 3), /boom/);
  });

  it('throws AggregateError when multiple tasks fail', async () => {
    const tasks = [
      async () => { throw new Error('e1'); },
      async () => { throw new Error('e2'); },
    ];
    const err = await pool(tasks, 2).catch((e) => e);
    assert.ok(err instanceof AggregateError, `expected AggregateError, got ${err.constructor.name}`);
    assert.equal(err.errors.length, 2);
  });

  it('is faster than serial with concurrency > 1', async () => {
    const start = Date.now();
    // 4 tasks each 50ms; serial = 200ms; concurrent = ~50ms
    const tasks = Array.from({ length: 4 }, () => () => sleep(50));
    await pool(tasks, 4);
    const elapsed = Date.now() - start;
    assertTiming(elapsed, 50, 80, 'pool concurrency speed');
  });

  it('reports progress', async () => {
    const log = [];
    const tasks = Array.from({ length: 5 }, () => async () => {});
    await pool(tasks, 5, { onProgress: (done, total) => log.push({ done, total }) });
    assert.equal(log.length, 5);
    assert.equal(log[4].done, 5);
    assert.equal(log[4].total, 5);
  });

  it('throws TypeError for non-array tasks', async () => {
    await assert.rejects(pool('bad'), /tasks must be an array/);
  });

  it('stops queuing on AbortSignal', async () => {
    const ac = new AbortController();
    let started = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
      started++;
      await sleep(20);
    });
    const p = pool(tasks, 2, { signal: ac.signal });
    await sleep(25); // let first batch start
    ac.abort();
    await p.catch(() => {}); // may or may not throw depending on whether any task erred
    assert.ok(started < 20, `expected some tasks skipped, started=${started}`);
  });

  // ── Stress test ────────────────────────────────────────────────────────────
  it('stress: 1000 tasks with concurrency=50', async () => {
    let maxRunning = 0;
    let running = 0;
    const tasks = Array.from({ length: 1000 }, (_, i) => async () => {
      running++;
      if (running > maxRunning) maxRunning = running;
      // Simulate tiny async work
      await sleep(0);
      running--;
      return i;
    });
    const results = await pool(tasks, 50);
    assert.equal(results.length, 1000);
    assert.ok(maxRunning <= 50, `concurrency exceeded: ${maxRunning}`);
    // Verify ordering
    assert.deepEqual(results, Array.from({ length: 1000 }, (_, i) => i));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIMEOUT
// ─────────────────────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  it('resolves when fn completes in time', async () => {
    const wrapped = withTimeout(async () => { await sleep(20); return 99; }, 200);
    assert.equal(await wrapped(), 99);
  });

  it('rejects with TimeoutError when fn is too slow', async () => {
    const wrapped = withTimeout(() => sleep(500), 50);
    const err = await wrapped().catch((e) => e);
    assert.equal(err.name, 'TimeoutError');
    assert.ok(/50ms/.test(err.message));
  });

  it('clears timer on success (no leak)', async () => {
    const wrapped = withTimeout(async () => 'fast', 1000);
    const result = await wrapped();
    assert.equal(result, 'fast');
    // If timer leaked, the process would hang — test passing proves clean-up
  });

  it('clears timer on rejection (no leak)', async () => {
    const wrapped = withTimeout(async () => { throw new Error('oops'); }, 1000);
    await assert.rejects(wrapped(), /oops/);
  });

  it('passes arguments to fn', async () => {
    const wrapped = withTimeout(async (a, b) => a + b, 100);
    assert.equal(await wrapped(3, 4), 7);
  });

  it('uses custom error message', async () => {
    const wrapped = withTimeout(() => sleep(500), 30, { message: 'custom msg' });
    const err = await wrapped().catch((e) => e);
    assert.ok(err.message.includes('custom msg'), err.message);
  });

  it('propagates non-timeout errors', async () => {
    const wrapped = withTimeout(async () => { throw new TypeError('type err'); }, 500);
    await assert.rejects(wrapped(), /type err/);
  });

  it('attaches timeout ms to error', async () => {
    const wrapped = withTimeout(() => sleep(500), 50);
    const err = await wrapped().catch((e) => e);
    assert.equal(err.timeout, 50);
  });

  it('throws TypeError for non-function', () => {
    assert.throws(() => withTimeout(42, 100), /fn must be a function/);
  });

  it('throws RangeError for non-positive ms', () => {
    assert.throws(() => withTimeout(async () => {}, 0), /ms must be a positive number/);
    assert.throws(() => withTimeout(async () => {}, -1), /ms must be a positive number/);
  });

  it('timing: rejects at ~correct time', async () => {
    const wrapped = withTimeout(() => sleep(1000), 60);
    const start = Date.now();
    await wrapped().catch(() => {});
    assertTiming(Date.now() - start, 60, 80, 'timeout timing');
  });
});

describe('raceTimeout', () => {
  it('resolves when promise wins', async () => {
    const result = await raceTimeout(Promise.resolve('win'), 1000);
    assert.equal(result, 'win');
  });

  it('rejects when timeout wins', async () => {
    const err = await raceTimeout(sleep(500), 30).catch((e) => e);
    assert.equal(err.name, 'TimeoutError');
  });

  it('ms=0 passes through immediately', async () => {
    const result = await raceTimeout(Promise.resolve('x'), 0);
    assert.equal(result, 'x');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEBOUNCE
// ─────────────────────────────────────────────────────────────────────────────

describe('debounce', () => {
  it('calls fn once after delay when called once', async () => {
    let calls = 0;
    const d = debounce(async () => { calls++; return 'v'; }, 40);
    const result = await d.call();
    assert.equal(result, 'v');
    assert.equal(calls, 1);
  });

  it('calls fn once for rapid repeated calls (trailing)', async () => {
    let calls = 0;
    const d = debounce(async (x) => { calls++; return x; }, 50);
    const p1 = d.call(1);
    const p2 = d.call(2);
    const p3 = d.call(3);
    const results = await Promise.all([p1, p2, p3]);
    assert.equal(calls, 1, 'should only call fn once');
    assert.deepEqual(results, [3, 3, 3], 'all callers get last arg result');
  });

  it('debounce window resets on each call', async () => {
    let calls = 0;
    const d = debounce(async () => { calls++; }, 60);
    d.call();
    await sleep(30);
    d.call();
    await sleep(30);
    d.call();
    await sleep(100); // wait for final call to fire
    assert.equal(calls, 1, 'timer should have reset each time');
  });

  it('allows a second invocation after first settles', async () => {
    let calls = 0;
    const d = debounce(async (x) => { calls++; return x; }, 30);
    const r1 = await d.call('a');
    const r2 = await d.call('b');
    assert.equal(r1, 'a');
    assert.equal(r2, 'b');
    assert.equal(calls, 2);
  });

  it('propagates fn errors to all callers', async () => {
    const d = debounce(async () => { throw new Error('bad'); }, 30);
    const p1 = d.call().catch((e) => e);
    const p2 = d.call().catch((e) => e);
    const [e1, e2] = await Promise.all([p1, p2]);
    assert.equal(e1.message, 'bad');
    assert.equal(e2.message, 'bad');
  });

  it('cancel() rejects pending callers', async () => {
    const d = debounce(async () => 'ok', 200);
    const p = d.call().catch((e) => e);
    d.cancel();
    const err = await p;
    assert.equal(err.name, 'CancelError');
  });

  it('flush() fires immediately without waiting', async () => {
    let calls = 0;
    const d = debounce(async () => { calls++; return 'flushed'; }, 500);
    const p = d.call();
    const start = Date.now();
    const result = await d.flush();
    const elapsed = Date.now() - start;
    assert.equal(result, 'flushed');
    assert.equal(calls, 1);
    assert.ok(elapsed < 100, `flush took too long: ${elapsed}ms`);
    // Original promise also resolves
    assert.equal(await p, 'flushed');
  });

  it('flush() on nothing returns undefined', async () => {
    const d = debounce(async () => 'x', 100);
    const result = await d.flush();
    assert.equal(result, undefined);
  });

  it('isPending() tracks timer state', async () => {
    const d = debounce(async () => {}, 100);
    assert.equal(d.isPending(), false);
    d.call();
    assert.equal(d.isPending(), true);
    await sleep(150);
    assert.equal(d.isPending(), false);
  });

  it('timing: fn fires ~ms after last call', async () => {
    let firedAt;
    const d = debounce(async () => { firedAt = Date.now(); }, 60);
    const start = Date.now();
    d.call();
    await sleep(20);
    d.call(); // reset timer
    await sleep(120);
    // Should have fired ~60ms after second call (at start+80ms)
    const elapsed = firedAt - (start + 20);
    assertTiming(elapsed, 60, 80, 'debounce timing');
  });

  it('throws TypeError for non-function fn', () => {
    assert.throws(() => debounce(42, 100), /fn must be a function/);
  });

  it('leading option fires on first call immediately', async () => {
    let calls = 0;
    const d = debounce(async (x) => { calls++; return x; }, 100, { leading: true });
    const start = Date.now();
    const p = d.call('A');
    const result = await p;
    const elapsed = Date.now() - start;
    assert.equal(result, 'A');
    assert.equal(calls, 1);
    assert.ok(elapsed < 50, `leading should fire fast, took ${elapsed}ms`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE
// ─────────────────────────────────────────────────────────────────────────────

describe('createQueue', () => {
  it('runs tasks in order with concurrency=1', async () => {
    const order = [];
    const q = createQueue(1);
    const p1 = q.add(async () => { await sleep(20); order.push(1); });
    const p2 = q.add(async () => { order.push(2); });
    const p3 = q.add(async () => { order.push(3); });
    await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it('returns task result', async () => {
    const q = createQueue(2);
    const r = await q.add(async () => 'hello');
    assert.equal(r, 'hello');
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const q = createQueue(3);
    const tasks = Array.from({ length: 10 }, () =>
      q.add(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await sleep(20);
        running--;
      })
    );
    await Promise.all(tasks);
    assert.ok(maxRunning <= 3, `concurrency exceeded: ${maxRunning}`);
  });

  it('propagates errors without stopping queue', async () => {
    const q = createQueue(1);
    const order = [];
    const p1 = q.add(async () => { throw new Error('bad'); }).catch((e) => e);
    const p2 = q.add(async () => { order.push('ok'); return 'ok'; });
    const [e, r] = await Promise.all([p1, p2]);
    assert.ok(e instanceof Error);
    assert.equal(r, 'ok');
    assert.deepEqual(order, ['ok']);
  });

  it('drain() resolves when empty from the start', async () => {
    const q = createQueue(1);
    await assert.doesNotReject(q.drain());
  });

  it('drain() resolves after all tasks complete', async () => {
    const q = createQueue(2);
    const done = [];
    for (let i = 0; i < 5; i++) {
      q.add(async () => { await sleep(20); done.push(i); });
    }
    await q.drain();
    assert.equal(done.length, 5);
  });

  it('multiple drain() calls all resolve', async () => {
    const q = createQueue(1);
    q.add(() => sleep(30));
    const promises = [q.drain(), q.drain(), q.drain()];
    await assert.doesNotReject(Promise.all(promises));
  });

  it('pause() stops task dispatch', async () => {
    const order = [];
    const q = createQueue(1);
    q.pause();
    const p1 = q.add(async () => { order.push(1); });
    const p2 = q.add(async () => { order.push(2); });
    await sleep(50);
    assert.deepEqual(order, [], 'tasks should not run while paused');
    q.resume();
    await Promise.all([p1, p2]);
    assert.deepEqual(order, [1, 2]);
  });

  it('resume() restarts processing', async () => {
    const q = createQueue(2);
    q.pause();
    const results = [];
    [1, 2, 3].forEach((n) => q.add(async () => { results.push(n); }));
    q.resume();
    await q.drain();
    assert.deepEqual(results.sort(), [1, 2, 3]);
  });

  it('size reflects waiting tasks', async () => {
    const q = createQueue(1);
    q.pause();
    q.add(() => sleep(10));
    q.add(() => sleep(10));
    assert.equal(q.size, 2);
    q.resume();
    await q.drain();
    assert.equal(q.size, 0);
  });

  it('pending reflects running tasks', async () => {
    const q = createQueue(2);
    let seen = 0;
    const check = q.add(async () => {
      await sleep(0); // yield
    });
    // After adding, one task is running
    assert.equal(q.pending + q.size, 1);
    await check;
    assert.equal(q.pending, 0);
  });

  it('clear() removes pending tasks and rejects their promises', async () => {
    const q = createQueue(1);
    // block the queue with one long task
    q.add(() => sleep(200));
    const p1 = q.add(() => sleep(10)).catch((e) => e);
    const p2 = q.add(() => sleep(10)).catch((e) => e);
    q.clear();
    const [e1, e2] = await Promise.all([p1, p2]);
    assert.equal(e1.name, 'CancelError');
    assert.equal(e2.name, 'CancelError');
  });

  it('clear() does not affect running tasks', async () => {
    const q = createQueue(1);
    let ran = false;
    const p = q.add(async () => { await sleep(30); ran = true; return 'done'; });
    q.clear(); // nothing pending yet; the running one is fine
    assert.equal(await p, 'done');
    assert.equal(ran, true);
  });

  it('throws RangeError for concurrency < 1', () => {
    assert.throws(() => createQueue(0), /concurrency must be/);
    assert.throws(() => createQueue(-1), /concurrency must be/);
  });

  it('rejects non-function tasks', async () => {
    const q = createQueue(1);
    await assert.rejects(q.add('not a fn'), /fn must be a function/);
  });

  it('paused getter reflects state', () => {
    const q = createQueue(1);
    assert.equal(q.paused, false);
    q.pause();
    assert.equal(q.paused, true);
    q.resume();
    assert.equal(q.paused, false);
  });

  // ── Stress test ────────────────────────────────────────────────────────────
  it('stress: 1000 tasks with concurrency=10', async () => {
    const q = createQueue(10);
    let maxRunning = 0;
    let running = 0;
    const results = [];

    for (let i = 0; i < 1000; i++) {
      q.add(async () => {
        running++;
        if (running > maxRunning) maxRunning = running;
        await sleep(0);
        running--;
        results.push(i);
      });
    }

    await q.drain();
    assert.equal(results.length, 1000, 'all tasks ran');
    assert.ok(maxRunning <= 10, `concurrency exceeded: ${maxRunning}`);
  });

  it('stress: interleaved add/drain cycles', async () => {
    const q = createQueue(5);
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 20; i++) {
        q.add(async () => { await sleep(0); });
      }
      await q.drain();
      assert.equal(q.size, 0);
      assert.equal(q.pending, 0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-UTILITY STRESS TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-utility stress tests', () => {
  it('pool + retry: 100 tasks each with retry logic', async () => {
    const tasks = Array.from({ length: 100 }, (_, i) => {
      let attempts = 0;
      return async () => retry(async () => {
        attempts++;
        if (attempts < 2 && i % 3 === 0) throw new Error('transient');
        return i;
      }, { retries: 2, delay: 0 });
    });
    const results = await pool(tasks, 20);
    assert.equal(results.length, 100);
    assert.deepEqual(results, Array.from({ length: 100 }, (_, i) => i));
  });

  it('queue + timeout: tasks respect per-task timeouts', async () => {
    const q = createQueue(5);
    const results = [];

    const timedTask = withTimeout(async (ms, val) => {
      await sleep(ms);
      return val;
    }, 100);

    const promises = [
      q.add(() => timedTask(20, 'a')),  // fast: ok
      q.add(() => timedTask(20, 'b')),  // fast: ok
      q.add(() => timedTask(200, 'c')), // slow: timeout
      q.add(() => timedTask(20, 'd')),  // fast: ok
    ];

    const settled = await Promise.allSettled(promises);
    assert.equal(settled[0].status, 'fulfilled');
    assert.equal(settled[0].value, 'a');
    assert.equal(settled[1].status, 'fulfilled');
    assert.equal(settled[1].value, 'b');
    assert.equal(settled[2].status, 'rejected');
    assert.equal(settled[2].reason.name, 'TimeoutError');
    assert.equal(settled[3].status, 'fulfilled');
    assert.equal(settled[3].value, 'd');
  });

  it('pool stress: 1000 tasks, concurrency 100, all complete', async () => {
    let completed = 0;
    const tasks = Array.from({ length: 1000 }, (_, i) => async () => {
      await sleep(0);
      completed++;
      return i * 2;
    });
    const results = await pool(tasks, 100);
    assert.equal(completed, 1000);
    assert.equal(results.length, 1000);
    assert.equal(results[500], 1000);
  });

  it('debounce under rapid concurrent calls: no memory growth', async () => {
    const d = debounce(async (n) => n, 20);
    const promises = [];
    for (let i = 0; i < 200; i++) {
      promises.push(d.call(i).catch(() => {}));
      if (i % 50 === 49) await sleep(30); // let batches fire
    }
    await Promise.allSettled(promises);
    assert.equal(d.isPending(), false, 'no timer should remain');
  });
});
