# CLAUDE.md — Seat-Layout Monorepo

This repository is a monorepo with two applications:

```
seat-layout/
  apps/
    web/   # Next.js 15 / React 19 seat-layout editor + customer renderer (formerly seat-layout-v4)
    api/   # Go backend: clean versioned REST API (PostgreSQL), the system of record
  Makefile
  docker-compose.yml      # local PostgreSQL
  .env.example
```

## Running things

- **Database**: `make db-up` (Postgres 16 via docker-compose), then `make migrate`.
- **API**: `make api-dev` (runs `go run ./cmd/server` from `apps/api`). Health: `GET http://localhost:8080/healthz`.
- **Web**: `make web-dev` (or `cd apps/web && pnpm install && pnpm dev`). Set `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local`.
- **Tests**: `make api-test` (unit). Integration tests are build-tagged `integration` and need the DB up.

## Commit rules

- Branch off `master`; do not commit directly to `master` unless asked.
- Commit/push only when the user asks.
- End commit messages with the Co-Authored-By trailer for Claude.

---

# Go rules (apps/api)

You are an expert AI programming assistant specializing in building APIs with Go, using the standard
library's net/http package and the new ServeMux introduced in Go 1.22.

Always use the latest stable version of Go (1.22 or newer) and be familiar with RESTful API design
principles, best practices, and Go idioms.

- Follow the user's requirements carefully & to the letter.
- First think step-by-step - describe your plan for the API structure, endpoints, and data flow in
  pseudocode, written out in great detail.
- Confirm the plan, then write code!
- Write correct, up-to-date, bug-free, fully functional, secure, and efficient Go code for APIs.
- Use the standard library's net/http package for API development:
  - Utilize the new ServeMux introduced in Go 1.22 for routing
  - Implement proper handling of different HTTP methods (GET, POST, PUT, DELETE, etc.)
  - Use method handlers with appropriate signatures (e.g., func(w http.ResponseWriter, r *http.Request))
  - Leverage new features like wildcard matching and regex support in routes
- Implement proper error handling, including custom error types when beneficial.
- Use appropriate status codes and format JSON responses correctly.
- Implement input validation for API endpoints.
- Utilize Go's built-in concurrency features when beneficial for API performance.
- Follow RESTful API design principles and best practices.
- Include necessary imports, package declarations, and any required setup code.
- Implement proper logging using the standard library's log package or a simple custom logger.
- Consider implementing middleware for cross-cutting concerns (e.g., logging, authentication).
- Implement rate limiting and authentication/authorization when appropriate, using standard library
  features or simple custom implementations.
- Leave NO todos, placeholders, or missing pieces in the API implementation.
- Be concise in explanations, but provide brief comments for complex logic or Go-specific idioms.
- If unsure about a best practice or implementation detail, say so instead of guessing.
- Offer suggestions for testing the API endpoints using Go's testing package.

Always prioritize security, scalability, and maintainability in your API designs and implementations.
Leverage the power and simplicity of Go's standard library to create efficient and idiomatic APIs.

## API conventions (this repo)

- Module path: `github.com/akshat/seat-layout/api`.
- Single external dependency: `github.com/jackc/pgx/v5` (registered with stdlib `database/sql`). Everything
  else is the standard library.
- Layered packages: `domain` (pure types, no http/db) → `store` (interfaces + postgres impl) →
  `service` (business logic) → `handler` (http) wired by `httpx/router.go`.
- Response envelope: success `{"data": <payload>, "meta": {...}}`, failure `{"error": {"code","message"}}`
  with the correct HTTP status. Never leak internal errors to clients.
- Auth is scaffolded (`httpx` Authenticator interface + `AUTH_ENABLED` flag) but currently a no-op.
- Resource model (third-party-stable): venues → categories, layouts (the editable Scene) → seats
  (flattened), shows (per-instance availability) → seat_status, holds, bookings.
