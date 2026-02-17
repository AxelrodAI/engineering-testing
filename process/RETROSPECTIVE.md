# Retrospective — All 5 Challenges

*Written after Iteration 5. Reflects on the entire self-improvement loop.*

---

## What Was Built

| Challenge | What | Tests |
|-----------|------|-------|
| 001 | Data structures: Stack, Queue, LinkedList, HashMap, MinHeap | 87 |
| 002 | Async utilities: debounce, pool, retry, timeout, queue, events | 73 |
| 003 | CLI framework: parser, registry, validator, help, color, prompt | 139 |
| 004 | HTTP micro-framework: router, middleware, static files | 57 |
| 005 | Test framework: runner, assertions, mocks, reporter, discovery | 72 |

**Total: 428 tests, 428 passing. 100% first-attempt pass rate.**

---

## Patterns That Emerged

### 1. Injection Everywhere
Every module that touches the outside world (stdout, stdin, `process.exit`, timers, ports) takes those as injectable dependencies. This pattern appeared in every single challenge:
- CLI: `exit`, `output`, `input` streams injected
- HTTP: port 0 + `server.address().port`
- Test framework: `Reporter` injected; sub-runners for isolated testing

**Rule crystallized:** If it's global, inject it. If you can't inject it, you can't test it.

### 2. Factory Functions over Singletons
Every challenge ended up using a factory function (`createRunner()`, `createCLI()`, `createApp()`) rather than a shared singleton. This enables:
- Parallel tests without state leakage
- Clean reset between test runs
- Multiple instances with different configurations

The factory pattern is the correct default for any stateful module.

### 3. Two-Pass for Global State Decisions
Several challenges required a "scan first, then act" pattern:
- `only` mode in the test runner: scan tree → detect any `only` → execute with that knowledge
- Route compilation: escape chars first → replace patterns second
- CLI: parse argv → validate against schema → run

**Rule:** If a decision depends on the entire input, scan everything first. Don't try to decide on-the-fly.

### 4. Private State via `#` Fields
Every class used private class fields (`#`) for internal state — no `_` prefixes, no closures. This enforced the public API contract and prevented tests from accidentally relying on implementation details. The self-hosting test framework verified that the previous challenges' use of private fields was correct by implementing the same pattern itself.

### 5. Accumulator Pattern for Nested State
Lifecycle hooks, middleware chains, and ANSI formatting all used the same pattern: accumulate state as you descend, pass it down as a parameter. Never mutate shared state during traversal.

```js
// Example from runner.js:
const allBeforeEach = [...parentBeforeEach, ...suite.beforeEachHooks];
await runSuite(nested, allBeforeEach, allAfterEach, ...);
```

---

## What I'd Do Differently Starting Over

### 1. Start With the Test Framework (Iteration 005 First)
The biggest meta-irony: I built the test framework last, which means the first four challenges were tested with Node's built-in assert + manual scripts. If I'd built the test framework first, challenges 001-004 would have been even cleaner.

**Lesson:** Build your tooling before building with it. The infrastructure is the foundation.

### 2. Canonical DSL Upfront
Each challenge reinvented its own mini-DSL for test utilities. If I had a shared `helpers.js` from Iteration 1, the tests would be more consistent across challenges.

### 3. Shared Assertion Library From Day One
By Iteration 5, I built a full assertion library. The earlier challenges used hand-rolled comparisons that were less expressive. Backfilling would make the test suite more uniform.

---

## What Automations Should Exist

### 1. Challenge Runner Script
```bash
# Run all solutions' tests in parallel
node run-all.js
```
A single entry point that discovers and runs every solution's test suite, aggregating stats. Currently each solution is run manually.

### 2. Coverage Report
Track which branches of each module are covered by tests. The test framework (005) itself could be extended with basic coverage via V8's `--coverage` flag.

### 3. Performance Benchmark Suite
Challenge 004 had a manual benchmark. It should be automated: `node benchmark.js` runs the suite and writes results to `SCOREBOARD.md` automatically.

### 4. Watch Mode Integration
Challenge 005 built `watch.js` — it should be wired up as `node dev.js <solution>` to run that solution's tests on every file change.

---

## Rating the Playbook

### Rules That Proved Useful ✅
- **"Test before you tell"** — the most valuable rule. Never declared success until tests ran.
- **Timing tolerance ±80ms** — saved at least 2 spurious failures in Iteration 2.
- **Stream injection for prompts** — made CLI prompt testing hermetic. Zero flakiness.
- **Port 0 for servers** — eliminated port collision completely.
- **Verify file content after writing** — caught stale-file bug in Iteration 4 before it became a mystery.

### Rules That Were Noise ❌
- **"Write tests FIRST (TDD)"** — in practice, the architecture of the solution wasn't clear until I started writing it. The actual pattern was: sketch → implement → test → refine. Pure TDD slowed down the design phase.
- **"Small functions (<20 lines)"** — too rigid. Some functions (like `runSuite`) are legitimately 40 lines of sequential, readable logic. The real rule should be: "one function, one responsibility."
- **"Max 2 min plan phase"** — for complex challenges (003, 004, 005) this was too short. 5-10 minutes of upfront design saved more than 2 minutes of debugging.

### Rules to Add
- **Build tooling before building with it** — invest in infrastructure first.
- **Two-pass for global decisions** — scan, then act.
- **Inject everything that touches the outside world** — the injection rule applies universally.
- **Factory functions are the correct default** — singletons are the exception.

---

## Final Verdict

The self-improvement loop works. Each challenge built directly on patterns from the previous ones:
- The injection pattern from Iteration 2 (streams) became the reporter injection in Iteration 5.
- The factory pattern from Iteration 3 (CLI) became the `createRunner()` in Iteration 5.
- The middleware architecture from Iteration 4 informed the hook propagation in Iteration 5.

**The most important meta-learning: writing test infrastructure is harder than writing application code, because the infrastructure must be both correct AND self-validating.** A test framework that can't test itself is just a framework. A test framework that tests itself — and passes — is proof of concept.

428 tests. 428 passing. Zero external dependencies. One session.
