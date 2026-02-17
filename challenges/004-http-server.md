# Challenge 004: Micro HTTP Framework

**Difficulty:** Advanced
**Goal:** Build a minimal Express-like HTTP framework on raw Node http module.

## Requirements

1. **Router** — GET/POST/PUT/DELETE, path params (:id), wildcards
2. **Middleware chain** — use(), per-route middleware, error middleware
3. **Request helpers** — body parsing (JSON), query params, headers
4. **Response helpers** — json(), status(), redirect(), send()
5. **Static file serving** — serve directory with MIME types
6. **CORS middleware** — configurable origins, methods, headers

## Rules
- Only Node built-ins (http, fs, path, url)
- Integration tests using actual HTTP requests
- Benchmark: handle 1000 req/sec on basic route
