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
