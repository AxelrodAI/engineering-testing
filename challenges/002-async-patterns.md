# Challenge 002: Async Utility Library

**Difficulty:** Intermediate
**Goal:** Build battle-tested async utilities that handle real-world concurrency.

## Requirements

1. **retry(fn, opts)** — exponential backoff, max retries, custom error filter
2. **pool(tasks, concurrency)** — run N tasks with max concurrency limit
3. **timeout(fn, ms)** — wrap any async fn with a timeout
4. **debounce(fn, ms)** — async-safe debounce
5. **queue(concurrency)** — task queue with add(), drain(), pause(), resume()

## Rules
- No external deps
- Must handle: cancellation, error propagation, memory leaks
- Tests must include timing assertions (within tolerance)
- Stress test with 1000+ tasks
