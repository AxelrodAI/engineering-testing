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
