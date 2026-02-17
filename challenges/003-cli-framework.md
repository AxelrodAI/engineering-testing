# Challenge 003: Mini CLI Framework

**Difficulty:** Intermediate
**Goal:** Build a lightweight CLI framework from scratch.

## Requirements

1. **Command parser** — parse argv into commands, flags, and positional args
2. **Command registry** — register commands with descriptions, options, handlers
3. **Help generator** — auto-generate --help from registry
4. **Validation** — required args, type coercion, enum constraints
5. **Colored output** — ANSI escape helpers (no chalk dependency)
6. **Interactive prompts** — confirm(y/n), select(list), input(text)

## Rules
- Zero dependencies
- Must work as both library and standalone
- Tests for parser edge cases (quoted strings, = syntax, --no-flag negation)
