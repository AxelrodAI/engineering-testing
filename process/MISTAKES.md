# Mistakes Log

*Every mistake is a future prevention rule. Updated automatically.*

| # | Iteration | Mistake | Root Cause | Prevention Rule Added |
|---|-----------|---------|------------|----------------------|
| 1 | 4 | Tests failed with stale file content in workspace | Multiple files written in one session; old versions persisted silently | Always verify file content with `head -5` or `cat` after writing, before running tests |
| 2 | 4 | Port collision in concurrent test runs | Hardcoded port numbers shared across test suites | Always use `server.listen(0)` (OS-assigned port) in integration tests; retrieve via `server.address().port` |
| 3 | 4 | Wildcard route regex off-by-one | `\\\*` matches literal `\*` not `*`; escape set was too broad | Escape non-special chars first, then handle `*` and `:` in a second dedicated pass |

## Rules Derived From Mistakes

### File Integrity
- Write a file → read it back immediately → verify expected content → only then run tests
- "It wrote successfully" ≠ "it contains what you think it contains"

### Test Isolation
- Each test server on port 0 (OS-assigned)
- Each test with its own runner instance (`createRunner()`) — never share global runner state between tests

### Regex Escape Ordering
- Escape special chars (`.+?^${}()|[\]\\`) BEFORE replacing route-specific patterns (`:param`, `*`)
- Never include `*` or `:` in the initial escape set — they need special handling after

## Iteration 5 — No New Mistakes
All 72 self-tests passed on the first run. No bugs found during development.

**Streak: Iterations 1, 2, 3, 5 — zero bugs. Iteration 4 — 3 stale-file bugs (all pre-test, process-level).**
