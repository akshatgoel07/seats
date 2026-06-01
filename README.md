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
