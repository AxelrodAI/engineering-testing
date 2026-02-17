# Challenge 006: Static Code Analyzer

**Difficulty:** Advanced
**Goal:** Build a tool that analyzes JavaScript source code for quality issues — without executing it.

## Requirements

1. **Tokenizer** — tokenize JS source into tokens (identifiers, keywords, operators, strings, numbers, comments)
2. **Complexity analyzer** — calculate cyclomatic complexity per function
3. **Dead code detector** — find unreachable code after return/throw statements
4. **Style checker** — configurable rules (max line length, no var, no console.log, naming conventions)
5. **Dependency mapper** — parse import/require statements, build dependency graph, detect circular deps
6. **Reporter** — output findings as structured JSON + human-readable summary

## Rules
- Zero deps, parse JS manually (regex + state machine, NOT eval/Function)
- Must be able to analyze the solutions from challenges 001-005
- Tests must include real JS snippets as fixtures
- Detect at least 3 real issues in our own codebase
