// self-test.js — THE META TEST: this framework testing itself

import { createRunner } from './runner.js';
import { expect } from './assertions.js';
import { fn, spyOn } from './mock.js';
import { runWithTimeout } from './async.js';
import { Reporter } from './reporter.js';
import { debounce } from './watch.js';
import { deepEqual } from './assertions.js';

// Use a string-based reporter so we can run tests about the reporter output
// without polluting stdout, but still show colored output for our own runner.

const { runner, describe, it, test, beforeAll, afterAll, beforeEach, afterEach, run } = createRunner({
  timeout: 3000,
});

// ─── 1. Assertions ───────────────────────────────────────────────────────────

describe('assertions', () => {
  describe('toBe', () => {
    it('passes on strict equality', () => {
      expect(1).toBe(1);
      expect('hello').toBe('hello');
      expect(null).toBe(null);
    });

    it('fails on different values', () => {
      expect(() => expect(1).toBe(2)).toThrow();
    });

    it('not.toBe passes when values differ', () => {
      expect(1).not.toBe(2);
    });

    it('not.toBe fails when values are equal', () => {
      expect(() => expect(1).not.toBe(1)).toThrow();
    });
  });

  describe('toEqual', () => {
    it('passes for deep object equality', () => {
      expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
    });

    it('passes for nested arrays', () => {
      expect([1, [2, 3]]).toEqual([1, [2, 3]]);
    });

    it('fails for different objects', () => {
      expect(() => expect({ a: 1 }).toEqual({ a: 2 })).toThrow();
    });

    it('not.toEqual passes when objects differ', () => {
      expect({ a: 1 }).not.toEqual({ a: 2 });
    });
  });

  describe('toThrow', () => {
    it('passes when function throws', () => {
      expect(() => { throw new Error('boom'); }).toThrow();
    });

    it('passes with matching message string', () => {
      expect(() => { throw new Error('boom'); }).toThrow('boom');
    });

    it('passes with matching message regex', () => {
      expect(() => { throw new Error('boom'); }).toThrow(/bo+m/);
    });

    it('fails when function does not throw', () => {
      expect(() => expect(() => {}).toThrow()).toThrow();
    });

    it('not.toThrow passes when function does not throw', () => {
      expect(() => 42).not.toThrow();
    });
  });

  describe('toContain', () => {
    it('passes for array containment', () => {
      expect([1, 2, 3]).toContain(2);
    });

    it('passes for string containment', () => {
      expect('hello world').toContain('world');
    });

    it('fails when item not in array', () => {
      expect(() => expect([1, 2]).toContain(5)).toThrow();
    });

    it('not.toContain passes when item absent', () => {
      expect([1, 2, 3]).not.toContain(99);
    });
  });

  describe('toMatch', () => {
    it('passes with regex', () => {
      expect('hello world').toMatch(/world/);
    });

    it('passes with string', () => {
      expect('hello world').toMatch('world');
    });

    it('fails when no match', () => {
      expect(() => expect('hello').toMatch(/xyz/)).toThrow();
    });
  });

  describe('toBeTruthy / toBeFalsy', () => {
    it('toBeTruthy passes for truthy values', () => {
      expect(1).toBeTruthy();
      expect('a').toBeTruthy();
      expect({}).toBeTruthy();
      expect([]).toBeTruthy();
    });

    it('toBeFalsy passes for falsy values', () => {
      expect(0).toBeFalsy();
      expect('').toBeFalsy();
      expect(null).toBeFalsy();
      expect(undefined).toBeFalsy();
      expect(false).toBeFalsy();
    });

    it('not.toBeTruthy passes for falsy', () => {
      expect(0).not.toBeTruthy();
    });

    it('not.toBeFalsy passes for truthy', () => {
      expect(1).not.toBeFalsy();
    });
  });

  describe('toBeNull', () => {
    it('passes for null', () => {
      expect(null).toBeNull();
    });

    it('fails for undefined', () => {
      expect(() => expect(undefined).toBeNull()).toThrow();
    });

    it('not.toBeNull passes for non-null', () => {
      expect(0).not.toBeNull();
      expect('').not.toBeNull();
    });
  });

  describe('toBeGreaterThan / toBeLessThan', () => {
    it('toBeGreaterThan passes', () => {
      expect(5).toBeGreaterThan(3);
    });

    it('toBeLessThan passes', () => {
      expect(3).toBeLessThan(5);
    });

    it('toBeGreaterThan fails on equal', () => {
      expect(() => expect(3).toBeGreaterThan(3)).toThrow();
    });

    it('not.toBeGreaterThan passes', () => {
      expect(3).not.toBeGreaterThan(5);
    });
  });

  describe('deepEqual helper', () => {
    it('handles primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('a', 'a')).toBe(true);
    });

    it('handles null', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, undefined)).toBe(false);
    });

    it('handles objects', () => {
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('handles arrays', () => {
      expect(deepEqual([1, 2], [1, 2])).toBe(true);
      expect(deepEqual([1, 2], [1])).toBe(false);
    });
  });
});

// ─── 2. Mock system ──────────────────────────────────────────────────────────

describe('mock system', () => {
  describe('fn() basics', () => {
    it('creates a callable mock', () => {
      const mock = fn();
      expect(typeof mock).toBe('function');
    });

    it('tracks call count', () => {
      const mock = fn();
      expect(mock.callCount).toBe(0);
      mock();
      mock();
      expect(mock.callCount).toBe(2);
    });

    it('tracks call args', () => {
      const mock = fn();
      mock(1, 2, 3);
      expect(mock.calls[0].args).toEqual([1, 2, 3]);
    });

    it('tracks return values', () => {
      const mock = fn(() => 42);
      mock();
      expect(mock.calls[0].returnValue).toBe(42);
    });

    it('lastCall returns most recent call', () => {
      const mock = fn();
      mock('a');
      mock('b');
      expect(mock.lastCall.args).toEqual(['b']);
    });
  });

  describe('mockReturnValue', () => {
    it('sets fixed return value', () => {
      const mock = fn();
      mock.mockReturnValue(99);
      expect(mock()).toBe(99);
      expect(mock()).toBe(99);
    });

    it('return value is tracked in calls', () => {
      const mock = fn();
      mock.mockReturnValue('hello');
      mock();
      expect(mock.calls[0].returnValue).toBe('hello');
    });
  });

  describe('mockImplementation', () => {
    it('sets implementation function', () => {
      const mock = fn();
      mock.mockImplementation((x) => x * 2);
      expect(mock(5)).toBe(10);
    });

    it('overrides previous return value', () => {
      const mock = fn();
      mock.mockReturnValue(1);
      mock.mockImplementation(() => 99);
      expect(mock()).toBe(99);
    });
  });

  describe('mockReset', () => {
    it('clears calls', () => {
      const mock = fn();
      mock();
      mock();
      mock.mockReset();
      expect(mock.callCount).toBe(0);
    });

    it('clears return value', () => {
      const mock = fn();
      mock.mockReturnValue(42);
      mock.mockReset();
      expect(mock()).toBe(undefined);
    });

    it('clears implementation', () => {
      const mock = fn();
      mock.mockImplementation(() => 99);
      mock.mockReset();
      expect(mock()).toBe(undefined);
    });
  });

  describe('spyOn', () => {
    it('replaces method with spy', () => {
      const obj = { greet: (name) => `hello ${name}` };
      const spy = spyOn(obj, 'greet');
      obj.greet('world');
      expect(spy.callCount).toBe(1);
      expect(spy.calls[0].args).toEqual(['world']);
    });

    it('calls through to original by default', () => {
      const obj = { double: (x) => x * 2 };
      const spy = spyOn(obj, 'double');
      const result = obj.double(5);
      expect(result).toBe(10);
    });

    it('mockRestore restores original', () => {
      const originalFn = (x) => x + 1;
      const obj = { add: originalFn };
      const spy = spyOn(obj, 'add');
      spy.mockRestore();
      expect(obj.add).toBe(originalFn);
    });

    it('throws if target is not a function', () => {
      const obj = { value: 42 };
      expect(() => spyOn(obj, 'value')).toThrow();
    });
  });

  describe('fn with initial implementation', () => {
    it('accepts initial implementation', () => {
      const mock = fn((a, b) => a + b);
      expect(mock(2, 3)).toBe(5);
      expect(mock.callCount).toBe(1);
    });
  });
});

// ─── 3. Async support ────────────────────────────────────────────────────────

describe('async support', () => {
  it('runs async tests', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('awaits async assertions', async () => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    await delay(10);
    expect(true).toBe(true);
  });

  it('runWithTimeout resolves for fast async', async () => {
    const result = await runWithTimeout(async () => 'done', 1000);
    expect(result).toBe('done');
  });

  it('runWithTimeout rejects on timeout', async () => {
    let threw = false;
    try {
      await runWithTimeout(
        () => new Promise(r => setTimeout(r, 2000)),
        50
      );
    } catch (err) {
      threw = true;
      expect(err.message).toMatch(/timed out/);
    }
    expect(threw).toBe(true);
  });

  it('runWithTimeout handles sync functions', async () => {
    const result = await runWithTimeout(() => 42, 1000);
    expect(result).toBe(42);
  });

  it('runWithTimeout propagates sync errors', async () => {
    let threw = false;
    try {
      await runWithTimeout(() => { throw new Error('sync error'); }, 1000);
    } catch (err) {
      threw = true;
      expect(err.message).toBe('sync error');
    }
    expect(threw).toBe(true);
  });
});

// ─── 4. Runner / Lifecycle hooks ─────────────────────────────────────────────

describe('runner lifecycle hooks', () => {
  const log = [];

  beforeAll(() => { log.push('beforeAll'); });
  afterAll(()  => { log.push('afterAll'); });
  beforeEach(() => { log.push('beforeEach'); });
  afterEach(()  => { log.push('afterEach'); });

  it('runs beforeAll before any test', () => {
    // beforeAll ran before this test (added 'beforeAll' to log)
    expect(log[0]).toBe('beforeAll');
  });

  it('runs beforeEach before each test', () => {
    // Each test gets its own beforeEach
    expect(log.filter(x => x === 'beforeEach').length).toBeGreaterThan(0);
  });
});

// ─── 5. Nested describe ──────────────────────────────────────────────────────

describe('nested describe blocks', () => {
  const order = [];

  beforeEach(() => order.push('outer-before'));
  afterEach(() => order.push('outer-after'));

  describe('inner', () => {
    beforeEach(() => order.push('inner-before'));
    afterEach(() => order.push('inner-after'));

    it('runs outer+inner beforeEach in order', () => {
      // At this point: outer-before, inner-before
      const befores = order.filter(x => x.includes('before'));
      expect(befores).toContain('outer-before');
      expect(befores).toContain('inner-before');
      // outer before inner
      expect(order.indexOf('outer-before')).toBeLessThan(order.indexOf('inner-before'));
    });
  });
});

// ─── 6. skip and only ────────────────────────────────────────────────────────

describe('skip behavior (using sub-runner)', () => {
  it('skipped tests do not run', async () => {
    let ran = false;
    const sub = createRunner({ timeout: 1000 });
    // Capture output quietly
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it.skip('should skip', () => { ran = true; });
    });

    const result = await sub.run();
    expect(ran).toBe(false);
    expect(result.stats.skipped).toBe(1);
    expect(result.stats.passed).toBe(0);
  });

  it('only tests run in only mode', async () => {
    const ran = [];
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it('should not run', () => { ran.push('normal'); });
      sub.it.only('should run', () => { ran.push('only'); });
    });

    const result = await sub.run();
    expect(ran).toContain('only');
    expect(ran).not.toContain('normal');
    expect(result.stats.passed).toBe(1);
  });

  it('describe.skip skips all tests in suite', async () => {
    const ran = [];
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe.skip('skipped suite', () => {
      sub.it('a', () => { ran.push('a'); });
      sub.it('b', () => { ran.push('b'); });
    });

    const result = await sub.run();
    expect(ran).toEqual([]);
    expect(result.stats.skipped).toBe(2);
  });
});

// ─── 7. Reporter ─────────────────────────────────────────────────────────────

describe('reporter output', () => {
  it('emits pass symbol for passing tests', async () => {
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it('passes', () => expect(1).toBe(1));
    });

    await sub.run();
    expect(output).toMatch('✓');
  });

  it('emits fail symbol for failing tests', async () => {
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it('fails', () => expect(1).toBe(2));
    });

    await sub.run();
    expect(output).toMatch('✗');
  });

  it('emits skip symbol for skipped tests', async () => {
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it.skip('skipped', () => {});
    });

    await sub.run();
    expect(output).toMatch('○');
  });

  it('includes summary stats', async () => {
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it('a', () => expect(true).toBe(true));
      sub.it('b', () => expect(true).toBe(true));
    });

    await sub.run();
    expect(output).toMatch('passed');
  });

  it('includes failure details with test name', async () => {
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it('my failing test', () => { throw new Error('deliberate failure'); });
    });

    await sub.run();
    expect(output).toMatch('deliberate failure');
  });
});

// ─── 8. Watch / Debounce ─────────────────────────────────────────────────────

describe('debounce utility', () => {
  it('delays execution', async () => {
    let callCount = 0;
    const db = debounce(() => callCount++, 50);
    db();
    db();
    db();
    // Not called yet
    expect(callCount).toBe(0);
    // Wait for debounce
    await new Promise(r => setTimeout(r, 100));
    expect(callCount).toBe(1);
  });

  it('resets timer on each call', async () => {
    let callCount = 0;
    const db = debounce(() => callCount++, 60);
    db();
    await new Promise(r => setTimeout(r, 30));
    db(); // reset timer
    await new Promise(r => setTimeout(r, 30));
    db(); // reset again
    await new Promise(r => setTimeout(r, 100));
    expect(callCount).toBe(1);
  });
});

// ─── 9. Stats totals ─────────────────────────────────────────────────────────

describe('runner stats', () => {
  it('returns accurate pass/fail/skip counts', async () => {
    const sub = createRunner({ timeout: 1000 });
    let output = '';
    sub.runner.setReporter(new Reporter({ out: { write: s => { output += s; } } }));

    sub.describe('suite', () => {
      sub.it('pass1', () => expect(1).toBe(1));
      sub.it('pass2', () => expect(2).toBe(2));
      sub.it.skip('skip1', () => {});
      sub.it('fail1', () => { throw new Error('oops'); });
    });

    const { stats } = await sub.run();
    expect(stats.passed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.skipped).toBe(1);
  });
});

// ─── Run ─────────────────────────────────────────────────────────────────────

const { stats } = await run();
process.exit(stats.failed > 0 ? 1 : 0);
