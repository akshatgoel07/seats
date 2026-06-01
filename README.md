# Seat Layout

![Seat Layout Builder](apps/web/public/seat-layout-builder-intro.webp)

A seat-layout platform with a visual **editor**, a customer-facing **renderer**, and a
clean, scalable **Go REST API** backed by PostgreSQL. Design a venue once, run many shows
against it, and sell seats with concurrency-safe holds and bookings.

```
seat-layout/
├── apps/
│   ├── web/        # Next.js 15 / React 19 — seat-layout editor + customer renderer
│   └── api/        # Go backend — versioned /v1 REST API (system of record)
├── Makefile        # dev / build / test / migrate targets
├── docker-compose.yml   # local PostgreSQL 16
└── .env.example    # configuration template
```

---

## Quick start 

Prerequisites: **Go 1.22+**, **Node + pnpm**, **Docker** (for Postgres).

```bash
# 1. Database
make db-up          # start Postgres (docker-compose) and wait until healthy
make migrate        # apply schema migrations

# 2. API  →  http://localhost:8080
make api-dev

# 3. Web  →  http://localhost:3000
cp .env.example apps/web/.env.local    # sets NEXT_PUBLIC_API_BASE_URL
make web-install
make web-dev
```

Health check: `curl http://localhost:8080/healthz` → `{"data":{"status":"ok"}}`

---

## Applications

### `apps/api` — Go backend

Built with the Go standard library (`net/http` + the Go 1.22 `ServeMux`); the only external
dependency is `pgx/v5`, registered with `database/sql`. PostgreSQL is the system of record.

- **Layered architecture** with dependencies pointing inward:
`handler` (HTTP) → `service` (business logic) → `store` (interfaces) → `store/postgres`,
all built on `domain` (pure types, seat flattening, validation).
- **Consistent envelope** — success: `{"data": …}`, failure: `{"error": {"code","message"}}`.
- **Concurrency-safe** holds and bookings using `SELECT … FOR UPDATE`, so a seat can never be
double-sold under load.
- **Built for integration** — a stable resource model and a flat per-seat inventory endpoint
let third parties consume the API without parsing the editor's scene graph.
- **Auth scaffolded but off** — middleware + `AUTH_ENABLED` flag are wired in; OAuth/API-keys
drop in later without touching handlers.

Full endpoint reference and the partner integration lifecycle live in
`[apps/api/README.md](apps/api/README.md)`.

### `apps/web` — editor & renderer

- **Editor** (`/editor/{layoutId}`) — visually design venues: rows (line/arc), seats, tables,
standing sections, shapes, text, and images. Saves the scene to the API, which derives the
flat seat list (row/column numbering, Excel-style labels, standing-section expansion).
- **Renderer** (`/seat-layout/{layoutId}?ssId={showId}`) — the customer view: renders the
layout joined with per-show seat availability and pricing for selection.
- Talks to the API via `services/api.js`; configure the base URL with `NEXT_PUBLIC_API_BASE_URL`.

---

## Domain model


| Concept         | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| **Venue**       | Top-level container; owns categories.                                    |
| **Category**    | A seat type / price tier (e.g. VIP, Standard).                           |
| **Layout**      | The editable design (the "scene"), stored verbatim as JSONB.             |
| **Seat**        | Flattened from a layout's scene on save — queryable inventory.           |
| **Show**        | A performance/screening instance of a layout, with its own availability. |
| **Seat status** | Per-show seat state: available / held / booked / blocked, plus price.    |
| **Hold**        | A time-bounded reservation of seats prior to booking (TTL).              |
| **Booking**     | A confirmed purchase; consumes a hold or books seats directly.           |


**Integration lifecycle:** `venue → layout → save scene → show → hold → booking`.

---

## Make targets

Run `make help` for the full list. Common ones:


| Target                      | Description                                 |
| --------------------------- | ------------------------------------------- |
| `make db-up`                | Start local Postgres and wait until healthy |
| `make db-down`              | Stop local Postgres                         |
| `make migrate`              | Apply database migrations                   |
| `make api-dev`              | Run the API server                          |
| `make api-test`             | Run API unit tests                          |
| `make api-test-integration` | Run API integration tests (needs `db-up`)   |
| `make vet`                  | `go vet` the API                            |
| `make web-install`          | Install web dependencies                    |
| `make web-dev`              | Run the Next.js dev server                  |


---

## Testing

```bash
make api-test                # Go unit tests
make api-test-integration    # Go integration tests (concurrency, holds, bookings)
cd apps/web && pnpm build    # web type-check + production build
```

---

## Configuration

The API reads its configuration from the environment (see `.env.example`):


| Variable                   | Default                                                                      | Purpose                                      |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `PORT`                     | `8080`                                                                       | API listen port                              |
| `DATABASE_URL`             | `postgres://seatlayout:seatlayout@localhost:5432/seatlayout?sslmode=disable` | Postgres DSN                                 |
| `CORS_ORIGINS`             | `http://localhost:3000`                                                      | Comma-separated allowed origins              |
| `AUTH_ENABLED`             | `false`                                                                      | Gate the (currently no-op) auth middleware   |
| `RATE_LIMIT_RPS`           | `50`                                                                         | Per-IP token-bucket refill rate (0 disables) |
| `RATE_LIMIT_BURST`         | `100`                                                                        | Per-IP burst size                            |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080`                                                      | API base URL used by the web app             |


---

## Conventions

- Branch off `master`; don't commit directly to `master` unless asked.
- Commit/push only when requested.

