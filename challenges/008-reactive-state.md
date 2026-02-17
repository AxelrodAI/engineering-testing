# Challenge 008: Reactive State System

**Difficulty:** Expert
**Goal:** Build a fine-grained reactive state management system (like Solid.js signals or Vue reactivity).

## Requirements

1. **signal(value)** — creates a reactive value. `signal.get()`, `signal.set(newVal)`
2. **computed(fn)** — derives a value from other signals. Auto-tracks dependencies. Lazy evaluation + caching.
3. **effect(fn)** — runs a side effect whenever its tracked dependencies change. Auto-cleanup.
4. **batch(fn)** — batch multiple signal updates, only trigger effects once at the end
5. **untrack(fn)** — read signals without creating dependency tracking
6. **Nested tracking** — computed values that depend on other computed values
7. **Circular detection** — detect and error on circular computed dependencies
8. **Disposal** — cleanup effects and computed values to prevent memory leaks

## Rules
- Zero deps
- Must handle diamond dependency problem correctly (A→B, A→C, B→D, C→D — D updates once)
- Stress test: 10,000 signals, 1,000 effects, measure update propagation time
- Compare eager vs lazy evaluation strategies
