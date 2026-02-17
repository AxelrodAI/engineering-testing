# Development Playbook v0.1

*This file evolves with every iteration. Each improvement is backed by data.*

## Iteration Protocol

1. **Pick challenge** — select next unfinished challenge by difficulty
2. **Plan** — write pseudocode/approach BEFORE coding (max 2 min)
3. **Build** — implement solution
4. **Test** — run tests, verify all pass
5. **Measure** — record metrics (time, attempts, bugs, lines of code)
6. **Reflect** — what went well? what was wasted effort?
7. **Improve** — update THIS file if a pattern emerged

## Current Best Practices

- Write tests FIRST (TDD) — catches design issues early
- Small functions (<20 lines) — easier to debug
- Descriptive variable names — reduces re-reading time
- Handle edge cases explicitly — don't rely on implicit behavior

## Code Quality Rules

- All solutions must have tests
- All tests must pass before commit
- No hardcoded values — use constants
- Error messages must be actionable

## Async Testing Patterns (learned Iteration 2)

### Timing Assertions
- Use `±80ms` tolerance on a shared VPS; narrower tolerances cause spurious failures under load.
- Measure elapsed via `Date.now()` before/after and assert inside a window: `lo <= elapsed <= hi`.
- For debounce timing, measure from the *last* call's timestamp, not the first.

### Shared-Window Debounce
- All callers within one debounce window share a single `{ promise, resolve, reject }` object.
- Each call updates the shared `args`; when the timer fires, fn runs with the last args and resolves the shared promise → all callers get the same result.

### Worker-Loop Pool Concurrency
- Spawn N workers that each pull from a shared index counter in a `while` loop — cleaner than Promise.all + semaphore.
- Preserves result order by pre-computing the task index before `await`.

### Queue Drain
- Store an array of resolve callbacks (`drainResolvers`); flush them whenever `running===0 && tasks.length===0`.
- Multiple concurrent `drain()` callers all get resolved correctly this way.

### AbortSignal in Retry
- Check signal at the start of EACH attempt AND patch the sleep to respond to abort mid-wait.
- Use `signal.addEventListener('abort', onAbort, { once: true })` inside the sleep Promise constructor.

### Error Taxonomy
- Single task failure → re-throw the original error (preserves stack/type).
- Multiple task failures → wrap in `AggregateError` (standard, inspectable).
- Cancelled tasks → custom `CancelError` with `err.name = 'CancelError'` (distinguishable in catch).
- Timeout → custom `TimeoutError` with `err.timeout = ms` property (tells caller the limit that was set).

## Metrics We Track

| Metric | Why |
|--------|-----|
| Time to first passing test | Speed of correct implementation |
| Bug count per solution | Code quality signal |
| Lines of code | Complexity indicator |
| Test count | Coverage signal |
| Attempts to pass | Iteration efficiency |

## CLI Parser Design (learned Iteration 3)

### Schema-Less vs. Schema-Aware Parsers
- A schema-less parser **cannot** distinguish `--flag nextToken` (flag with value) from `--flag` (boolean) + `nextToken` (positional) without external info.
- **Design rule:** In schema-less mode, any non-flag token following a `--flag` is consumed as its value. Document this prominently.
- **Workarounds for callers:** use `--flag=value` form, or place commands before flags, or use `--` separator.
- If you want schema-aware parsing, pass the schema to the parser (boolean flags skip value consumption).

### Testing Interactive Prompts
- Inject streams: `confirm(q, { input: mockInput('y'), output: nullOutput() })` — no process.stdin mocking needed.
- `readline.createInterface` requires `terminal: false` when using non-TTY streams (mock Readables) to avoid ANSI handling.
- Guard resolve/reject with an `answered` boolean — readline fires 'close' after 'line', which would double-resolve without the guard.
- `Readable.from(['y\n'])` is the cleanest mock stream — works with readline's line-splitting.

### CLI Factory Pattern
- Inject `exit` and `output` into the CLI factory for test isolation — never call `process.exit()` directly in library code.
- Wire: `parse(argv)` → `validate(flags, schema)` → `registry.run(cmd, values, args)`.
- `--help` and `--version` are handled before command lookup — they short-circuit all validation.

### ANSI Color Helpers
- Never use chalk in zero-dep modules; ANSI escape codes are simple: `\x1b[${code}m${text}\x1b[0m`.
- Always provide `stripAnsi()` for plain-text output and length measurement (column alignment).
- `compose(...fns)` allows declarative style combinations: `compose(bold, red)('error')`.

## HTTP Framework Patterns (learned Iteration 4)

### Port 0 for Integration Tests
- `server.listen(0)` asks the OS to assign a free port — eliminates all port-collision failures.
- Retrieve the assigned port via `server.address().port` after the listen callback fires.
- This pattern is essential for parallel test suites that each spin up a server.

### Wildcard Regex in Route Compilers
- Escape special chars (`.+?^${}()|[\]\\`) FIRST, leaving `*` and `:` alone.
- Then replace `:name` with `([^/]+)` and `*` with `(.*)` in a second pass.
- Common trap: using `\\\*` (matches literal `\*`) instead of `\*` (matches literal `*`).
- The correct regex for a path like `/files/*` is `^/files/(.*)(?:/)?$`.

### Middleware Architecture
- **Normal middleware:** 3-arity `(req, res, next)` — detect at registration via `fn.length !== 4`.
- **Error middleware:** 4-arity `(err, req, res, next)` — detect at registration via `fn.length === 4`.
- Store them in separate arrays; error middleware is only invoked when `next(err)` is called.
- Wrap every handler in try/catch AND `.catch()` to handle both sync throws and async rejection.

### Testing HTTP Redirects with fetch()
- `fetch(url, { redirect: 'manual' })` returns the redirect response (3xx) without following it.
- Default `fetch` follows redirects — you'll get 200 instead of 302 if you forget `redirect: 'manual'`.

### Static File Serving Safety
- Always `path.resolve()` both root and request path, then check `.startsWith(absRoot)` before serving.
- Use `statSync` with try/catch (or `existsSync`) rather than always throwing 404.
- `Content-Length` must be set for HEAD requests to return headers correctly.

### Workspace File Integrity
- **Always verify file content before running tests** when multiple files are written in a session.
- Stale/cached file versions can silently persist and cause mysterious test failures.
- Use `head -5 filename` or read the file after writing to confirm the expected content is there.

## Test Framework Architecture (learned Iteration 5)

### Self-Hosting Design
- To test the reporter and skip/only behavior of the framework itself, create a **sub-runner** with an in-memory string reporter.
- `createRunner()` factory pattern: each call creates an isolated runner instance with its own state — enables nested test frameworks without global state pollution.
- The reporter is injected (not imported as a singleton) — making it swap-able for testing.

### MockFunction Constructor Pattern
- The mock constructor builds a regular function (`const mockFn = function(){...}`) and attaches properties directly to it.
- Returning `mockFn` from the constructor overrides `this` — the caller gets the callable, not the instance.
- This is preferable to `class extends Function` (which has engine-specific quirks).
- Use `Object.defineProperty` for computed getters (`calls`, `callCount`, `lastCall`) to keep the mock's internal state truly private.

### Two-Pass `only` Detection
- Before executing any test, scan the ENTIRE suite tree to detect any `only` flags (`#checkHasOnly()`).
- Use the result as a single `hasOnly: boolean` flag passed down through `#runSuite()`.
- Without the two-pass approach, you might execute non-only tests in suites that appear before the only-marked one.

### Lifecycle Hook Propagation
- Accumulate `beforeEach`/`afterEach` hooks as `[...parentHooks, ...suiteHooks]` when recursing.
- `afterEach` reversal: reverse order (innermost first) by building as `[...suite.afterEachHooks, ...parentAfterEach]`.
- **Run afterEach even on test failure** — wrap test in try/catch, store error, run hooks, then report.

### ESM Top-Level Await
- `await run()` at the top level of an ESM self-test file is clean and valid — no IIFE needed.
- `process.exit(stats.failed > 0 ? 1 : 0)` ensures CI gets a proper exit code.

### Timeout with Mixed Sync/Async
- Don't require `async` keyword detection — just check if the return value has `.then`.
- Sync functions resolve immediately in the same microtask; the timeout timer is cancelled before it can fire.
- This handles sync, async, and generator functions uniformly.

### Zero-Dependency ANSI Reporter
- Raw escape codes: `\x1b[32m` (green), `\x1b[31m` (red), `\x1b[33m` (yellow), `\x1b[0m` (reset).
- Store failures during the run; print details AFTER the summary line (avoids interleaving with live output).
- Stack trace: split on `\n`, skip first line (message duplicate), take first 5 frames to keep output readable.

## Static Code Analyzer Patterns (learned Iteration 6)

### Tokenizer: Regex vs Division Disambiguation
- `/` is a regex literal if the last significant (non-comment) token was: an operator, keyword (except `this/true/false/null`), `(`, `[`, `{`, or the start of file.
- `/` is division if the last significant token was: identifier, number, string, template, regex, `)`, `]`, `}`, or value keywords.
- Store `lastSignificant` and update it for every non-whitespace, non-comment token.

### Tokenizer: Operator Matching
- Always match longest operators first (sort by length descending).
- `...`, `===`, `!==`, `>>=` etc. must be checked before `=`, `!`, `>`.
- Template literals: track `${...}` nesting depth inside the backtick string; only close on `` ` `` when depth === 0.

### Complexity: Skip Parameters Before Finding Function Body
- `function f(opts = {})` — the `{}` in default parameters is NOT the function body.
- Algorithm: find the `(` after `function`/name, skip to the matching `)`, then the next `{` is the body.
- Use `findMatchingParen()` helper to count nested parens correctly.
- Pre-scan all function definitions first, then walk each body independently.

### Dead Code: Handle Nested Braces in Return Expressions
- `return { a: 1, b: [1, 2] };` — the `{`, `[` are part of the expression, not new scopes.
- While scanning forward to find the end of a jump statement, track `nestDepth` for `{([` and `})]`.
- Only stop when hitting `;` at `nestDepth === 0`, or a `}` that closes the containing scope.

### Dead Code: Braceless Control Flow False Positive
- `if (x) return;` — the `return` is conditional; the next statement is NOT dead.
- Before reporting dead code, look backward from the jump keyword.
- If the nearest preceding `)` at the same brace depth closes an `if/while/for` condition → skip.
- Stop backward scan at `{` (entered a block) or `;` (new statement) — then the jump IS standalone.

### Self-Analysis is Valuable
- Running the analyzer on its own code caught real issues: `console.error` in watch.js, high-CC functions.
- The analyzer correctly self-reports: `tokenize()` CC = 100 — honest and useful.
- High CC alone isn't a bug: `validate()` CC=30 is appropriate for validation logic; use it as a signal.
