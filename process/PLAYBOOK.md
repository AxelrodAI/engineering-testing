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

## Metrics We Track

| Metric | Why |
|--------|-----|
| Time to first passing test | Speed of correct implementation |
| Bug count per solution | Code quality signal |
| Lines of code | Complexity indicator |
| Test count | Coverage signal |
| Attempts to pass | Iteration efficiency |
