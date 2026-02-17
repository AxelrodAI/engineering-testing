# Iteration Log

*Raw log of every development iteration.*

---

## Iteration 1 — Challenge 001: Data Structures

- **Started:** 2026-02-17T10:45:07Z
- **Completed:** 2026-02-17T10:47:30Z
- **Tests:** 87 written, 87 passing
- **Bugs found during dev:** None — first-run green across all 87 tests.
- **Implementation notes:**
  - Stack: array-backed, O(1) push/pop/peek via native JS Array
  - Queue: linked-list-backed, true O(1) enqueue + dequeue (no array shift)
  - LinkedList: singly-linked with O(1) prepend, O(n) append/find/delete; in-place O(n)/O(1) reverse
  - HashMap: djb2 hashing, separate-chaining collision resolution, automatic doubling resize at 0.75 load factor; special-cased `has()` to correctly handle `undefined` values
- **Learnings:**
  - `has()` on HashMap is subtle — `get()` returns `undefined` for both missing keys AND keys stored with `undefined` value; need a dedicated walk of the bucket chain to distinguish them.
  - Queue backed by a linked list avoids the O(n) array-shift pitfall that trips up array-based queue implementations.
  - LinkedList `append` is O(n) because we traverse to the tail each time; a tail pointer would make it O(1) — worth doing in a future iteration.
  - Using private class fields (`#`) enforces encapsulation cleanly in modern Node ESM.

---

## Iteration 2 — Challenge 002: Async Utility Library

- **Started:** 2026-02-17T10:47:30Z
- **Completed:** 2026-02-17T10:51:45Z
- **Tests:** 73 written, 73 passing
- **Bugs found during dev:** None — first-run green across all 73 tests.
- **Implementation notes:**
  - `retry`: exponential backoff with AbortSignal, maxDelay cap, jitter, filter fn, onRetry hook; `fn` receives attempt index; abortable sleep avoids timer leaks.
  - `pool`: worker-loop concurrency pattern — N workers race against a shared index; results array preserves original order; single vs. multiple errors → Error vs. AggregateError.
  - `withTimeout`: wraps any async fn, always clears the timer on both success and failure; `raceTimeout` convenience for already-started promises.
  - `debounce`: shared window pattern — all rapid callers share one Promise; trailing (default) and leading edge modes; `cancel()`, `flush()`, `isPending()` control surface.
  - `queue`: manual tick loop drives concurrency; `drain()` uses resolver array; `pause()`/`resume()` gate the tick; `clear()` rejects pending tasks as CancelErrors.
- **Learnings:**
  - Debounce shared-window: returning the same Promise to all callers within a window is the key insight — all get the same result when fn finally fires.
  - Worker-loop (pool) is cleaner than Promise.all(semaphore) for large task arrays — no extra allocations, straightforward ordering.
  - AbortSignal in retry requires patching both the per-attempt check AND the sleep, otherwise an abort during sleep silently ignores the signal.
  - Timing tests: ±80ms tolerance was sufficient on this VPS; narrower tolerances can cause spurious CI failures under load.

---

## Iteration 3 — Challenge 003: Mini CLI Framework

- **Started:** 2026-02-17T10:52:00Z
- **Completed:** 2026-02-17T10:56:30Z
- **Tests:** 139 written, 139 passing
- **Bugs found during dev:** 3 test expectation mismatches (parser behaviour, not implementation bugs)
- **Implementation notes:**
  - `parser.js`: pure argv parser — no schema needed; kebab→camelCase, `--flag=value`, `--no-flag` negation, `-abc` combined short flags, `--` end-of-flags; key design: space-sep flags consume next non-flag token as value (schema-less ambiguity is documented in tests)
  - `registry.js`: private `#commands` Map; chainable `register()`; typed `run()` delegates to handler with (flags, args, ctx)
  - `validate.js`: schema-driven — applies alias resolution, type coercion (string/number/boolean), defaults, required checks, enum constraints; extra flags pass through
  - `help.js`: ANSI-aware `generateHelp()` / `generateCommandHelp()`; auto-aligns columns; handles null command gracefully
  - `color.js`: pure ANSI helpers — red/green/yellow/blue/magenta/cyan/white/bold/dim/italic/underline; `stripAnsi()` regex; `compose()` for function chaining
  - `prompt.js`: readline-based confirm/select/input with stream injection for testability; `mockInput()` + `nullOutput()` make prompt tests hermetic (no process.stdin)
  - `index.js`: `createCLI()` factory wires parser → validate → registry; `--help`/`--version`/unknown-command handling; `exit` injectable for test isolation
- **Learnings:**
  - Schema-less parsers can't distinguish `--flag nextPositional` from `--flag value` — document this clearly in tests; use `--flag=value` form or place command before flags to avoid ambiguity
  - Stream injection (`input:`/`output:` options) is the right pattern for testable interactive prompts — no mocking needed
  - readline `terminal: false` is essential when piping mock streams — prevents readline from treating input as a TTY
  - `createInterface` fires 'close' after last 'line', so guard with `answered` boolean to avoid double-resolving promises

---

## Iteration 4 — Challenge 004: Micro HTTP Framework

- **Started:** 2026-02-17T10:59:00Z
- **Completed:** 2026-02-17T11:07:00Z
- **Tests:** 57 written, 57 passing
- **Bugs found during dev:** 3 (pre-test: stale file versions in workspace)
- **Implementation notes:**
  - `router.js`: path param (`:id`) and wildcard (`*`) compilation via regex; `all()` method for any-method routes; `routes` getter for introspection; optional trailing slash tolerance; URL-decode param values.
  - `request.js`: `wrapRequest()` attaches `pathname`, `params`, `query` to IncomingMessage; `parseBody()` reads stream, auto-detects content-type (JSON/URL-encoded/text/binary Buffer).
  - `response.js`: `wrapResponse()` adds `json()`, `send()`, `status()`, `redirect()`, `set()` to ServerResponse; all chainable.
  - `middleware.js`: `cors()` — wildcard/string/array origins, preflight 204, credentials, maxAge; `bodyParser()` — wraps `parseBody` as middleware, auto-skips GET/HEAD; `staticFiles()` — MIME detection, path traversal prevention, directory index, HEAD support, Cache-Control.
  - `framework.js`: `App` class wires parser → middleware chain → router → error chain; async handlers wrapped in try/catch + `.catch()`; `listen(port=0)` for OS-assigned port; `close()` for clean teardown.
  - **Benchmark:** 1000 sequential requests — 0 failures; 1000 concurrent (batches of 50) — 2058 req/s, 486ms total.
- **Process bug:** Several files were unexpectedly stale (different version) in the workspace. Always read file content before running tests when files were previously written.
- **Learnings:**
  - Wildcard regex: `*` must NOT be in the escape set for the initial char-class replace, then replaced with `(.*)` separately. Confusingly, `\\\*` (regex for literal `\*`) vs `/\*/g` (regex for `*`) is a common off-by-one error in escape chaining.
  - `routes` as getter vs method: `app.routes` (getter) is more ergonomic than `app.routes()` (method). When the underlying field is a getter, delegating via another getter just works.
  - Port 0 for tests: `server.listen(0)` makes OS assign a free port — completely eliminates port-collision failures in parallel test runs.
  - `fetch()` with `redirect: 'manual'` is required to inspect redirect responses (302) without following them.
  - Error middleware uses 4-arity `(err, req, res, next)` — must detect this by `fn.length === 4` to separate error handlers from normal middleware at registration time.

---

## Iteration 6 — Challenge 006: Static Code Analyzer

- **Started:** 2026-02-17T11:16:00Z
- **Completed:** 2026-02-17T11:35:00Z
- **Tests:** 79 written, 79 passing (first run after one bug fix)
- **Time to first green:** ~15 minutes (one bug fix required)
- **Bugs found during dev:** 1 (default param `{}` mistaken for function body brace)
- **Implementation notes:**
  - `tokenizer.js`: State-machine tokenizer using greedy operator matching (longest match first). Disambiguates `/` as regex vs division by tracking the last significant token — regex follows operators/keywords/open punctuation, division follows values. Handles template literals with `${...}` nesting (depth counter), escape sequences, and all number formats (hex/binary/octal/BigInt).
  - `complexity.js`: Two-phase approach: (1) `discoverFunctions()` pre-scans tokens to find each function's actual body `{` by skipping the parameter list (finding matching `)`), then (2) walks the body counting branches. This correctly handles `function f(opts = {})` — the `{}` in default params is not mistaken for the function body.
  - `dead-code.js`: Walks tokens tracking brace depth. For each jump keyword (`return/throw/break/continue`), checks whether it's inside a braceless control-flow (`if (x) return;`) via backward scan for `)` closing a condition. Scans forward properly through nested braces to handle `return { ... };` without false positives.
  - `style-checker.js`: Line-level and token-level checks. Camel-case validator uses regex to allow camelCase, PascalCase, SCREAMING_SNAKE_CASE, _private, $prefixed. Property access (after `.`) and import specifiers are whitelisted.
  - `dependency-mapper.js`: Token-walk parser for ESM `import/export from`, `require()`, and dynamic `import()`. Builds adjacency list; circular detection via DFS with a `inStack` Set tracking the current path.
  - `reporter.js`: ANSI color helper with `c(color, text)` pattern. `toJSON` converts `Map` → plain object for serialization. `toHuman` groups style issues by rule, shows max 5 per rule.
  - `index.js`: `analyze(source, options)` — tokenizes then runs all sub-analyzers. `analyzeFiles([])` for cross-file dep analysis.
- **Self-analysis of own codebase (challenges 001–005 + 006):**
  - **`solutions/002-async-patterns/retry.js`**: `retry()` cyclomatic complexity = 13 (high) — the function handles 5 orthogonal concerns (retries, backoff, jitter, abort signal, filter) making it inherently complex.
  - **`solutions/003-cli-framework/validate.js`**: `validate()` complexity = 30 (very high!) and `solutions/003-cli-framework/parser.js`: `parse()` = 21 — these are the most complex functions in the codebase.
  - **`solutions/005-test-framework/watch.js`**: 3× `console.error` style violations — real production code using console for error reporting.
  - **Own code (challenge 006)**: The analyzer correctly self-reports: `tokenize()` complexity = 100 (honest!), `parseImports()` = 42, `detectDeadCode()` = 29.
  - **Circular deps**: None detected in any challenge solution.
- **Bugs fixed:**
  - **Default param `{}`**: `function f(opts = {})` — the `{}` in default parameters was being treated as the function body opening brace, giving complexity = 1 for everything. Fixed by pre-scanning to find the actual body `{` after the closing `)` of parameters.
- **Learnings:**
  - **Regex vs division disambiguation**: The last-significant-token rule works well — regex follows operators/keywords; division follows values/identifiers/closing delimiters.
  - **Default parameters with `{}`**: Always find the function body `{` by first matching the `(...)` parameter list, then looking for `{` after the `)`. Never just look for the first `{` after `function`.
  - **Return object literal false positive**: `return { ... }` — the `{` is an object literal, not a new scope. Fix: track nesting depth (with `{[(`/`}])`) while scanning forward through the return expression; only stop at `;` or a `}` that closes the containing scope.
  - **Braceless control flow false positive**: `if (x) return;` — the `return` is conditional, so the next statement is NOT dead. Fix: scan backward from the jump keyword; if the preceding `)` closes a control-flow condition (`if`/`while`/`for`), skip dead-code reporting.
  - **Cyclomatic complexity ≠ code quality**: High CC functions in this codebase (validate=30, parse=21) are appropriate for their job — they handle many edge cases. CC is a signal, not a verdict.

---

## Iteration 5 — Challenge 005: Self-Hosting Test Framework (META)

- **Started:** 2026-02-17T11:10:00Z
- **Completed:** 2026-02-17T11:18:00Z
- **Self-tests:** 72 written, 72 passing (first run — zero failures)
- **Time to first green:** ~8 minutes
- **Bugs found during dev:** 0 (clean first run)
- **Implementation notes:**
  - `runner.js`: `Runner` class wraps a suite tree; DSL functions (`describe/it/beforeEach/afterEach/beforeAll/afterAll`) are closures that delegate to the runner; `createRunner()` factory returns the DSL + `run()` + `reset()`. Key design: `only` mode is a two-pass system — first `#checkHasOnly()` walks the entire tree to detect any `only` flag, then `#runSuite()` skips suites/tests that don't match.
  - `assertions.js`: `Expectation` class with private `#value` and `#negated`; `get not` returns a new `Expectation(value, !negated)`; `#assert(pass, failMsg, negateMsg)` handles both polarities. `deepEqual()` is a recursive structural comparator handling primitives, null, arrays, and plain objects.
  - `mock.js`: `MockFunction` constructor returns the callable function itself (not `this`) — this is the key design choice that lets `fn()` return a callable with attached properties. Used `Object.defineProperty` for `calls/callCount/lastCall` getters; `spyOn` wraps original with a call-through implementation and adds `mockRestore`.
  - `async.js`: `runWithTimeout` uses a Promise race pattern with `setTimeout`; handles both sync functions (detected by checking if result has `.then`) and async functions without needing `async` detection.
  - `reporter.js`: `Reporter` class with injected `out` stream for testability; ANSI codes are raw escape sequences (no deps); failure list is accumulated during the run and printed at the end with stack traces.
  - `discovery.js`: recursive `walk()` with `readdir`/`stat`; skips `node_modules`/`.git`/dotfiles; returns sorted paths for deterministic order.
  - `watch.js`: `fs.watch` with `recursive: true`; debounce via `setTimeout`/`clearTimeout`; `pendingFiles` Set accumulates all changed files during the debounce window and delivers them together.
  - `index.js`: flat re-export of all public APIs.
  - `self-test.js`: 72 tests across 9 describe groups; uses sub-runners (via `createRunner()`) with a captured string reporter to test reporter output and skip/only behavior in isolation. Top-level `await run()` at module level (ESM top-level await).
- **Learnings:**
  - **Self-hosting design pattern:** To test the reporter and skip/only behavior, create a sub-runner with an in-memory reporter (capture output as string). This avoids polluting the real test output while still verifying behavior.
  - **MockFunction returns itself, not `this`:** The constructor trick — `const mockFn = function(){...}; ...; return mockFn;` — makes `fn()` return a callable function with methods attached. Returning `this` from a constructor is rarely right; returning a different value is the escape hatch.
  - **Top-level await in ESM:** `await run()` at the top level of an ESM module is valid and clean. No need to wrap in `(async () => {})()`.
  - **only mode needs two passes:** You must scan the ENTIRE tree first to detect any `only` flag, then use that to gate execution. Doing it in one pass risks running non-only tests in suites that appear before the only-marked one.
  - **afterEach must run even on test failure:** Wrap the test in try/catch, then run afterEach regardless. Track the test error separately and report it after hooks complete.
  - **Nested beforeEach propagation:** Accumulate hooks as `[...parentBeforeEach, ...suite.beforeEachHooks]` before recursing into child suites. This naturally propagates outer hooks to inner tests.
