// index.js — Public API for the test framework

export { createRunner, Runner } from './runner.js';
export { expect, AssertionError, deepEqual } from './assertions.js';
export { fn, spyOn, MockFunction } from './mock.js';
export { Reporter } from './reporter.js';
export { runWithTimeout, DEFAULT_TIMEOUT } from './async.js';
export { findTestFiles, discover, runTestFile } from './discovery.js';
export { watchDirs, debounce } from './watch.js';
