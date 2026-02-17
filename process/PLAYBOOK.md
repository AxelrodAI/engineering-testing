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
