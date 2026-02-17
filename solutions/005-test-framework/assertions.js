// assertions.js — expect() with all matchers + not modifier

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function formatValue(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object' && v !== null) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
    // Clean up stack to remove framework internals
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AssertionError);
    }
  }
}

class Expectation {
  #value;
  #negated;

  constructor(value, negated = false) {
    this.#value = value;
    this.#negated = negated;
  }

  get not() {
    return new Expectation(this.#value, !this.#negated);
  }

  #assert(pass, failMessage, negateMessage) {
    const shouldPass = this.#negated ? !pass : pass;
    if (!shouldPass) {
      throw new AssertionError(this.#negated ? negateMessage : failMessage);
    }
  }

  toBe(expected) {
    const actual = this.#value;
    this.#assert(
      actual === expected,
      `Expected ${formatValue(actual)} to be ${formatValue(expected)}`,
      `Expected ${formatValue(actual)} NOT to be ${formatValue(expected)}`
    );
    return this;
  }

  toEqual(expected) {
    const actual = this.#value;
    this.#assert(
      deepEqual(actual, expected),
      `Expected ${formatValue(actual)} to deeply equal ${formatValue(expected)}`,
      `Expected ${formatValue(actual)} NOT to deeply equal ${formatValue(expected)}`
    );
    return this;
  }

  toThrow(expectedMsg) {
    const fn = this.#value;
    if (typeof fn !== 'function') {
      throw new AssertionError(`toThrow() requires a function, got ${typeof fn}`);
    }

    let threw = false;
    let thrownError = null;
    try {
      fn();
    } catch (e) {
      threw = true;
      thrownError = e;
    }

    if (this.#negated) {
      if (threw) {
        throw new AssertionError(
          `Expected function NOT to throw, but it threw: ${thrownError?.message ?? thrownError}`
        );
      }
      return this;
    }

    if (!threw) {
      throw new AssertionError(`Expected function to throw, but it did not`);
    }

    if (expectedMsg !== undefined) {
      const msg = thrownError instanceof Error ? thrownError.message : String(thrownError);
      if (expectedMsg instanceof RegExp) {
        if (!expectedMsg.test(msg)) {
          throw new AssertionError(
            `Expected error message to match ${expectedMsg}, got: "${msg}"`
          );
        }
      } else {
        if (!msg.includes(String(expectedMsg))) {
          throw new AssertionError(
            `Expected error message to include "${expectedMsg}", got: "${msg}"`
          );
        }
      }
    }
    return this;
  }

  toContain(item) {
    const actual = this.#value;
    let contains;
    if (typeof actual === 'string') {
      contains = actual.includes(String(item));
    } else if (Array.isArray(actual)) {
      contains = actual.some(v => deepEqual(v, item));
    } else {
      throw new AssertionError(`toContain() requires a string or array, got ${typeof actual}`);
    }

    this.#assert(
      contains,
      `Expected ${formatValue(actual)} to contain ${formatValue(item)}`,
      `Expected ${formatValue(actual)} NOT to contain ${formatValue(item)}`
    );
    return this;
  }

  toMatch(pattern) {
    const actual = this.#value;
    if (typeof actual !== 'string') {
      throw new AssertionError(`toMatch() requires a string, got ${typeof actual}`);
    }
    let matches;
    if (pattern instanceof RegExp) {
      matches = pattern.test(actual);
    } else {
      matches = actual.includes(String(pattern));
    }

    this.#assert(
      matches,
      `Expected "${actual}" to match ${pattern instanceof RegExp ? pattern : formatValue(pattern)}`,
      `Expected "${actual}" NOT to match ${pattern instanceof RegExp ? pattern : formatValue(pattern)}`
    );
    return this;
  }

  toBeTruthy() {
    const actual = this.#value;
    this.#assert(
      Boolean(actual),
      `Expected ${formatValue(actual)} to be truthy`,
      `Expected ${formatValue(actual)} NOT to be truthy (to be falsy)`
    );
    return this;
  }

  toBeFalsy() {
    const actual = this.#value;
    this.#assert(
      !actual,
      `Expected ${formatValue(actual)} to be falsy`,
      `Expected ${formatValue(actual)} NOT to be falsy (to be truthy)`
    );
    return this;
  }

  toBeNull() {
    const actual = this.#value;
    this.#assert(
      actual === null,
      `Expected ${formatValue(actual)} to be null`,
      `Expected value NOT to be null`
    );
    return this;
  }

  toBeUndefined() {
    const actual = this.#value;
    this.#assert(
      actual === undefined,
      `Expected ${formatValue(actual)} to be undefined`,
      `Expected value NOT to be undefined`
    );
    return this;
  }

  toBeDefined() {
    const actual = this.#value;
    this.#assert(
      actual !== undefined,
      `Expected value to be defined (not undefined)`,
      `Expected value NOT to be defined`
    );
    return this;
  }

  toBeGreaterThan(n) {
    const actual = this.#value;
    this.#assert(
      actual > n,
      `Expected ${formatValue(actual)} to be greater than ${n}`,
      `Expected ${formatValue(actual)} NOT to be greater than ${n}`
    );
    return this;
  }

  toBeLessThan(n) {
    const actual = this.#value;
    this.#assert(
      actual < n,
      `Expected ${formatValue(actual)} to be less than ${n}`,
      `Expected ${formatValue(actual)} NOT to be less than ${n}`
    );
    return this;
  }

  toBeGreaterThanOrEqual(n) {
    const actual = this.#value;
    this.#assert(
      actual >= n,
      `Expected ${formatValue(actual)} to be >= ${n}`,
      `Expected ${formatValue(actual)} NOT to be >= ${n}`
    );
    return this;
  }

  toBeLessThanOrEqual(n) {
    const actual = this.#value;
    this.#assert(
      actual <= n,
      `Expected ${formatValue(actual)} to be <= ${n}`,
      `Expected ${formatValue(actual)} NOT to be <= ${n}`
    );
    return this;
  }

  toHaveLength(len) {
    const actual = this.#value;
    const actualLen = actual?.length;
    this.#assert(
      actualLen === len,
      `Expected length ${actualLen} to be ${len}`,
      `Expected length ${actualLen} NOT to be ${len}`
    );
    return this;
  }

  toHaveProperty(key, value) {
    const actual = this.#value;
    const keys = String(key).split('.');
    let current = actual;
    for (const k of keys) {
      if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, k)) {
        this.#assert(
          false,
          `Expected object to have property "${key}"`,
          `Expected object NOT to have property "${key}"`
        );
        return this;
      }
      current = current[k];
    }
    if (value !== undefined) {
      this.#assert(
        deepEqual(current, value),
        `Expected property "${key}" to equal ${formatValue(value)}, got ${formatValue(current)}`,
        `Expected property "${key}" NOT to equal ${formatValue(value)}`
      );
    } else {
      this.#assert(true, '', `Expected object NOT to have property "${key}"`);
    }
    return this;
  }
}

export function expect(value) {
  return new Expectation(value);
}

export { AssertionError, deepEqual };
