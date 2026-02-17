# Challenge 005: Build a Test Framework

**Difficulty:** Advanced  
**Goal:** Build the test framework we've been using — from scratch. Meta-level challenge.

## Requirements

1. **Test runner** — describe(), it(), before/afterEach, before/afterAll
2. **Assertions** — expect().toBe(), toEqual(), toThrow(), toContain(), toMatch()
3. **Async support** — async tests with timeout detection
4. **Reporter** — colorized pass/fail output, summary stats, failure details
5. **File discovery** — find and run *.test.js files recursively
6. **Watch mode** — re-run on file changes (fs.watch)
7. **Mocking** — fn() spy with call tracking, mockReturnValue, mockImplementation

## Rules
- Zero deps — this IS the test infrastructure
- Must be able to test itself (self-hosting)
- Performance: run 500 tests in <2 seconds
