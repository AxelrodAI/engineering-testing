# Challenge 007: Task Orchestrator (DAG Runner)

**Difficulty:** Expert
**Goal:** Build a dependency-aware task runner that executes a DAG of tasks with max parallelism.

## Requirements

1. **DAG builder** — define tasks with dependencies: `task("build", { deps: ["lint", "test"] }, fn)`
2. **Cycle detection** — detect and report circular dependencies before execution
3. **Topological scheduler** — execute tasks in dependency order, parallelize independent tasks
4. **Concurrency control** — configurable max parallelism
5. **Progress reporting** — real-time status (pending/running/done/failed) with duration per task
6. **Failure modes** — fail-fast (stop on first error) vs. fail-safe (run all possible tasks)
7. **Caching** — skip tasks whose inputs haven't changed (file hash based)
8. **Dry run** — show execution plan without running

## Rules
- Zero deps
- Must handle 100+ task DAGs efficiently
- Visualize the DAG as ASCII art
- Use the async pool from Challenge 002 internally
