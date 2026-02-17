// runner.js — Test runner with describe/it/skip/only/lifecycle hooks

import { runWithTimeout, DEFAULT_TIMEOUT } from './async.js';
import { Reporter } from './reporter.js';

// ─── Suite / Test data structures ───────────────────────────────────────────

function createSuite(name, parent = null) {
  return {
    name,
    parent,
    depth: parent ? parent.depth + 1 : 0,
    tests: [],
    suites: [],
    beforeAllHooks: [],
    afterAllHooks: [],
    beforeEachHooks: [],
    afterEachHooks: [],
    only: false,
    skip: false,
  };
}

function createTest(name, fn, suite, { skip = false, only = false } = {}) {
  return {
    name,
    fn,
    suite,
    depth: suite.depth + 1,
    skip,
    only,
    fullName: buildFullName(suite, name),
  };
}

function buildFullName(suite, testName) {
  const parts = [];
  let s = suite;
  while (s && s.name) {
    parts.unshift(s.name);
    s = s.parent;
  }
  parts.push(testName);
  return parts.join(' > ');
}

// ─── Runner state ────────────────────────────────────────────────────────────

class Runner {
  #root = createSuite('');
  #current = null;
  #timeout = DEFAULT_TIMEOUT;
  #reporter = null;

  constructor({ timeout = DEFAULT_TIMEOUT, reporter } = {}) {
    this.#timeout = timeout;
    this.#reporter = reporter ?? new Reporter();
    this.#current = this.#root;
  }

  setReporter(r) { this.#reporter = r; }
  setTimeout(ms) { this.#timeout = ms; }

  // ── DSL methods ─────────────────────────────────────────────────────────

  describe(name, fn, { only = false, skip = false } = {}) {
    const suite = createSuite(name, this.#current);
    suite.only = only;
    suite.skip = skip;
    this.#current.suites.push(suite);

    const prev = this.#current;
    this.#current = suite;
    try {
      fn(); // synchronous — collect tests/hooks
    } finally {
      this.#current = prev;
    }
  }

  it(name, fn, { only = false, skip = false } = {}) {
    const test = createTest(name, fn, this.#current, { only, skip });
    this.#current.tests.push(test);
  }

  beforeAll(fn) { this.#current.beforeAllHooks.push(fn); }
  afterAll(fn)  { this.#current.afterAllHooks.push(fn); }
  beforeEach(fn){ this.#current.beforeEachHooks.push(fn); }
  afterEach(fn) { this.#current.afterEachHooks.push(fn); }

  // ── Execution ────────────────────────────────────────────────────────────

  async run() {
    const reporter = this.#reporter;
    const stats = { passed: 0, failed: 0, skipped: 0 };

    // Determine if `only` mode is active
    const hasOnly = this.#checkHasOnly(this.#root);

    reporter.onRunStart();
    await this.#runSuite(this.#root, [], [], stats, reporter, hasOnly);
    reporter.onRunEnd(stats);

    return { stats, passed: stats.failed === 0 };
  }

  #checkHasOnly(suite) {
    if (suite.only) return true;
    for (const test of suite.tests) {
      if (test.only) return true;
    }
    for (const nested of suite.suites) {
      if (this.#checkHasOnly(nested)) return true;
    }
    return false;
  }

  async #runSuite(suite, parentBeforeEach, parentAfterEach, stats, reporter, hasOnly) {
    // Skip entire suite?
    if (suite.skip && !suite.only) {
      this.#skipSuite(suite, stats, reporter);
      return;
    }

    // In only mode, skip suites that have no only descendants
    if (hasOnly && !suite.only && !this.#checkHasOnly(suite)) {
      return;
    }

    // Print suite header (skip root empty-name suite)
    if (suite.name) {
      reporter.onSuiteStart(suite);
    }

    // Run beforeAll for this suite
    for (const hook of suite.beforeAllHooks) {
      await runWithTimeout(hook, this.#timeout);
    }

    const allBeforeEach = [...parentBeforeEach, ...suite.beforeEachHooks];
    const allAfterEach  = [...suite.afterEachHooks, ...parentAfterEach];

    // Run tests in this suite
    for (const test of suite.tests) {
      await this.#runTest(test, allBeforeEach, allAfterEach, stats, reporter, hasOnly);
    }

    // Run nested suites
    for (const nested of suite.suites) {
      await this.#runSuite(nested, allBeforeEach, allAfterEach, stats, reporter, hasOnly);
    }

    // Run afterAll
    for (const hook of suite.afterAllHooks) {
      await runWithTimeout(hook, this.#timeout);
    }
  }

  async #runTest(test, beforeEachHooks, afterEachHooks, stats, reporter, hasOnly) {
    // Determine if we should skip or run
    if (test.skip) {
      reporter.onTestSkip(test);
      stats.skipped++;
      return;
    }

    if (hasOnly && !test.only && !this.#isSuiteOnly(test.suite)) {
      // In only mode — skip tests not marked only (unless parent suite is only)
      reporter.onTestSkip(test);
      stats.skipped++;
      return;
    }

    // Run beforeEach hooks
    for (const hook of beforeEachHooks) {
      try {
        await runWithTimeout(hook, this.#timeout);
      } catch (err) {
        reporter.onTestFail(test, new Error(`beforeEach failed: ${err.message}`));
        stats.failed++;
        return;
      }
    }

    // Run the test
    let testError = null;
    try {
      await runWithTimeout(test.fn, this.#timeout);
    } catch (err) {
      testError = err;
    }

    // Run afterEach hooks (always, even if test failed)
    for (const hook of afterEachHooks) {
      try {
        await runWithTimeout(hook, this.#timeout);
      } catch (err) {
        if (!testError) testError = new Error(`afterEach failed: ${err.message}`);
      }
    }

    if (testError) {
      reporter.onTestFail(test, testError);
      stats.failed++;
    } else {
      reporter.onTestPass(test);
      stats.passed++;
    }
  }

  #isSuiteOnly(suite) {
    if (!suite) return false;
    if (suite.only) return true;
    return this.#isSuiteOnly(suite.parent);
  }

  #skipSuite(suite, stats, reporter) {
    for (const test of suite.tests) {
      reporter.onTestSkip(test);
      stats.skipped++;
    }
    for (const nested of suite.suites) {
      this.#skipSuite(nested, stats, reporter);
    }
  }

  reset() {
    this.#root = createSuite('');
    this.#current = this.#root;
  }
}

// ─── Global runner instance + DSL functions ──────────────────────────────────

export function createRunner(options = {}) {
  const runner = new Runner(options);

  const describe = (name, fn) => runner.describe(name, fn);
  describe.only  = (name, fn) => runner.describe(name, fn, { only: true });
  describe.skip  = (name, fn) => runner.describe(name, fn, { skip: true });

  const it = (name, fn) => runner.it(name, fn);
  it.only  = (name, fn) => runner.it(name, fn, { only: true });
  it.skip  = (name, fn) => runner.it(name, fn, { skip: true });

  const test = it;

  const beforeAll  = (fn) => runner.beforeAll(fn);
  const afterAll   = (fn) => runner.afterAll(fn);
  const beforeEach = (fn) => runner.beforeEach(fn);
  const afterEach  = (fn) => runner.afterEach(fn);

  return {
    runner,
    describe,
    it,
    test,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    run: () => runner.run(),
    reset: () => runner.reset(),
  };
}

export { Runner, createSuite, createTest };
