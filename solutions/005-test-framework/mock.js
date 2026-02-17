// mock.js — Mock/spy system

export class MockFunction {
  #calls = [];
  #returnValue = undefined;
  #implementation = null;
  #hasReturnValue = false;

  constructor(implementation = null) {
    this.#implementation = implementation;

    // The actual callable mock — a regular function that closes over `this`
    const self = this;
    const mockFn = function (...args) {
      let returnValue;
      if (self.#implementation) {
        returnValue = self.#implementation(...args);
      } else if (self.#hasReturnValue) {
        returnValue = self.#returnValue;
      } else {
        returnValue = undefined;
      }
      self.#calls.push({ args, returnValue });
      return returnValue;
    };

    // Attach control methods directly to the function object
    mockFn.mockReturnValue = (value) => {
      self.#hasReturnValue = true;
      self.#returnValue = value;
      return mockFn;
    };

    mockFn.mockImplementation = (fn) => {
      self.#implementation = fn;
      self.#hasReturnValue = false;
      return mockFn;
    };

    mockFn.mockReset = () => {
      self.#calls = [];
      self.#returnValue = undefined;
      self.#implementation = null;
      self.#hasReturnValue = false;
      return mockFn;
    };

    mockFn.mockRestore = null; // set by spyOn

    Object.defineProperty(mockFn, 'calls', {
      get: () => self.#calls,
    });

    Object.defineProperty(mockFn, 'callCount', {
      get: () => self.#calls.length,
    });

    Object.defineProperty(mockFn, 'lastCall', {
      get: () => self.#calls[self.#calls.length - 1] ?? null,
    });

    Object.defineProperty(mockFn, 'lastArgs', {
      get: () => self.#calls[self.#calls.length - 1]?.args ?? null,
    });

    mockFn.isMock = true;

    return mockFn;
  }
}

/**
 * Create a mock function (spy).
 * @param {Function} [implementation] — optional initial implementation
 * @returns {Function} mock function with tracking properties
 */
export function fn(implementation = null) {
  return new MockFunction(implementation);
}

/**
 * Spy on an object method, replacing it with a mock that also calls the original.
 * Returns the mock. Call mock.mockRestore() to restore.
 */
export function spyOn(obj, method) {
  const original = obj[method];
  if (typeof original !== 'function') {
    throw new Error(`spyOn: "${method}" is not a function on the target object`);
  }

  const spy = fn((...args) => original.apply(obj, args));

  spy.mockRestore = () => {
    obj[method] = original;
  };

  obj[method] = spy;
  return spy;
}
