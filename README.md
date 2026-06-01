# Seat Layout

![Seat Layout Builder](apps/web/public/seat-layout-builder-intro.webp)

Design a venue once, run many shows against it, and sell seats safely even under heavy concurrency. Seat Layout pairs a visual editor and a customer renderer with a clean Go REST API backed by PostgreSQL.

```
seat-layout/
├── apps/
│   ├── web/   Next.js 15 / React 19 editor and customer renderer
│   └── api/   Go REST API, the system of record
├── Makefile
├── docker-compose.yml
└── .env.example
```

## Quick start

You'll need Go 1.22+, Node with pnpm, and Docker for Postgres.

```bash
# 1. Database
make db-up          # start Postgres and wait until it's healthy
make migrate        # apply schema migrations

# 2. API → http://localhost:8080
make api-dev

# 3. Web → http://localhost:3000
cp .env.example apps/web/.env.local
make web-install
make web-dev
```

Confirm it's alive with `curl http://localhost:8080/healthz`, which returns `{"data":{"status":"ok"}}`.

## The apps

### apps/api

Built on the Go standard library (net/http with the Go 1.22 ServeMux), with pgx/v5 as the only outside dependency and PostgreSQL as the system of record. The layers point inward: handler, then service, then store, then postgres, all resting on a pure domain package that handles seat flattening and validation. Every response shares one envelope, `{"data": …}` on success and `{"error": {"code","message"}}` on failure. Holds and bookings rely on `SELECT … FOR UPDATE`, so a seat can never be sold twice. A stable resource model and a flat seat inventory endpoint let partners integrate without parsing the editor's scene graph. Auth sits behind an `AUTH_ENABLED` flag but does nothing yet. The full endpoint reference lives in apps/api/README.md.

### apps/web

The Next.js editor and renderer. The editor at `/editor/{layoutId}` lets you design venues visually: rows as lines or arcs, seats, tables, standing sections, shapes, text, and images. Saving sends the scene to the API, which derives the flat seat list. The renderer at `/seat-layout/{layoutId}?ssId={showId}` is the customer view, joining a layout with availability and pricing for each show. Point it at the API with `NEXT_PUBLIC_API_BASE_URL`.

## Domain model

The flow runs venue, layout, save scene, show, hold, booking.

A **venue** is the top level container and owns its categories. A **category** is a seat type or price tier such as VIP or Standard. A **layout** is the editable design, the scene, stored as JSONB. **Seats** are flattened from a layout on save so they become queryable inventory. A **show** is one performance of a layout with its own availability, and **seat status** tracks every seat for that show as available, held, booked, or blocked, along with its price. A **hold** is a reservation with a TTL taken before purchase, and a **booking** is the confirmed sale.

## Make targets

Run `make help` for the full list. The everyday ones: `make db-up` and `make db-down` start and stop local Postgres, `make migrate` applies migrations, `make api-dev` runs the server, `make api-test` and `make api-test-integration` run the unit and integration suites (integration needs the database up), and `make web-install` followed by `make web-dev` brings up the Next.js app.

## Configuration

The API reads from the environment; see `.env.example`. `PORT` sets the listen port (8080) and `DATABASE_URL` the Postgres DSN. `CORS_ORIGINS` lists the allowed origins. `AUTH_ENABLED` gates the auth middleware and stays false for now. `RATE_LIMIT_RPS` (50) and `RATE_LIMIT_BURST` (100) size the token bucket applied by IP, and a rate of 0 turns it off. The web app uses `NEXT_PUBLIC_API_BASE_URL` to reach the API.

## Conventions

Branch off master and don't commit there directly unless asked. Commit and push only when requested.
