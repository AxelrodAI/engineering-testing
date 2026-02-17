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
