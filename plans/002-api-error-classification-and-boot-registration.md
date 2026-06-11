# Plan 002: Return 404/409 instead of 500 for malformed IDs and constraint conflicts, and register API routes regardless of boot-time DB state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3747b9a..HEAD -- apps/api/internal/handler apps/api/cmd/server apps/api/internal/store/postgres/db.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> Note: the working tree at planning time carried **uncommitted** perf changes
> in `apps/api` (handler/layout.go `get` has an ETag probe; handler/layout.go
> `listSeats` calls `ListSeatsJSON`). The excerpts below reflect that working
> tree. If those changes are absent, the surrounding code differs slightly but
> the route table and `PathValue` call sites are identical — proceed.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but plan 001 also edits `cmd/server/main.go` + `routes.go` — execute 001 and 002 sequentially, not in parallel, and re-run the later plan's drift check)
- **Category**: bug
- **Planned at**: commit `3747b9a`, 2026-06-10

## Why this matters

Three related robustness gaps, all confirmed by reading the code (and one reproduced live by the maintainer):

1. **`GET /v1/layouts/not-a-uuid` returns 500, not 404.** Every path ID goes straight from `r.PathValue(...)` into a `WHERE id = $1` query against a `UUID` column. Postgres rejects non-UUID input with SQLSTATE `22P02`; that error is wrapped with `fmt.Errorf` in the store and never classified by `service.mapError`, so `httpx.WriteError` logs it as an *unhandled error* and returns a generic 500. This affects **all 22 parameterized routes** (venues, categories, layouts, shows, holds, bookings). Clients can't distinguish "bad ID" from "server broken", and every probe pollutes the error logs.
2. **Unique-constraint violations surface as 500.** Example: `seats` has `UNIQUE (layout_id, seat_uid)`; a scene whose flattened seats collide (a standalone seat ID equal to `<standingSectionId>_seat_<n>`) makes `SaveScene` fail with SQLSTATE `23505` → 500 instead of 409.
3. **If Postgres is unreachable for the ~3s startup probe, the API never recovers.** `main.go` registers `/v1` routes only when a one-time boot ping succeeds; otherwise the server permanently serves 404 for every API route until manually restarted, even after the DB comes up. `sql.Open` is lazy and every store call returns proper errors, so there is no reason to gate registration.

## Current state

Relevant files:

- `apps/api/internal/handler/handler.go` — central route table `RegisterV1` (lines 15–61). All parameterized patterns and their handlers:

```go
// apps/api/internal/handler/handler.go:23-58 (abridged; ALL routes shown in the file)
	mux.HandleFunc("GET /v1/venues/{venueId}", v.get)
	mux.HandleFunc("PATCH /v1/venues/{venueId}", v.update)
	mux.HandleFunc("DELETE /v1/venues/{venueId}", v.delete)
	mux.HandleFunc("GET /v1/venues/{venueId}/categories", c.list)
	mux.HandleFunc("POST /v1/venues/{venueId}/categories", c.create)
	mux.HandleFunc("PATCH /v1/categories/{categoryId}", c.update)
	mux.HandleFunc("DELETE /v1/categories/{categoryId}", c.delete)
	mux.HandleFunc("GET /v1/venues/{venueId}/layouts", l.listByVenue)
	mux.HandleFunc("POST /v1/venues/{venueId}/layouts", l.create)
	mux.HandleFunc("GET /v1/layouts/{layoutId}", l.get)
	mux.HandleFunc("PUT /v1/layouts/{layoutId}", l.saveScene)
	mux.HandleFunc("PATCH /v1/layouts/{layoutId}", l.updateMeta)
	mux.HandleFunc("DELETE /v1/layouts/{layoutId}", l.delete)
	mux.HandleFunc("POST /v1/layouts/{layoutId}/publish", l.publish)
	mux.HandleFunc("GET /v1/layouts/{layoutId}/seats", l.listSeats)
	mux.HandleFunc("GET /v1/layouts/{layoutId}/shows", sh.listByLayout)
	mux.HandleFunc("POST /v1/layouts/{layoutId}/shows", sh.create)
	mux.HandleFunc("GET /v1/shows/{showId}", sh.get)
	mux.HandleFunc("DELETE /v1/shows/{showId}", sh.delete)
	mux.HandleFunc("GET /v1/shows/{showId}/seats", sh.seats)
	mux.HandleFunc("PATCH /v1/shows/{showId}/seats", sh.patchSeats)
	mux.HandleFunc("POST /v1/shows/{showId}/holds", b.createHold)
	mux.HandleFunc("DELETE /v1/holds/{holdId}", b.releaseHold)
	mux.HandleFunc("GET /v1/holds/{holdId}", b.getHold)
	mux.HandleFunc("POST /v1/shows/{showId}/bookings", b.createBooking)
	mux.HandleFunc("GET /v1/bookings/{bookingId}", b.getBooking)
```

- `apps/api/internal/handler/common.go` — currently only the `pagination` helper (23 lines). The new helpers go here.
- `apps/api/internal/service/errors.go:14-29` — `mapError` classifies only `store.ErrNotFound`, `store.ErrConflict`, `*domain.ValidationError`; everything else falls through to 500.
- `apps/api/internal/httpx/errors.go` — `ErrNotFound(message string)` (line 43) and `ErrConflict` (line 51) constructors; `WriteError` in `respond.go:33-40` logs unknown errors and writes `ErrInternal()`.
- `apps/api/internal/store/postgres/layout.go` — `SaveScene` (lines ~116–153): `UPDATE layouts … RETURNING`, then `DELETE FROM seats`, then `insertSeats` bulk insert; insert errors come back as `fmt.Errorf("insert seats: %w", err)`-style wrapped pg errors.
- `apps/api/internal/store/postgres/db.go` — postgres `DB` wrapper; a good home for a shared error-classification helper.
- `apps/api/cmd/server/main.go:47-57` — conditional route registration:

```go
	mux := http.NewServeMux()
	handler.NewHealth(db).Register(mux)

	pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	dbReachable := db.PingContext(pingCtx) == nil
	cancel()
	if dbReachable {
		registerAPIRoutes(mux, db, log)
	} else {
		log.Warn("database not reachable at startup; serving health probes only (readiness will report not-ready)")
	}
```

(If plan 001 already ran, the call is `registerAPIRoutes(mux, stores, log)` — same structure.)

- The only external dependency is `github.com/jackc/pgx/v5`; its `pgconn` subpackage (already in `go.sum`) exposes `*pgconn.PgError` with a `Code` field (SQLSTATE).

Conventions: handlers hold no business logic; client-facing errors only via `httpx.APIError` (never raw internals — see `respond.go:31-40`); table-driven stdlib tests (see `internal/config/config_test.go`, `internal/httpx/httpx_test.go`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `cd apps/api && go build ./...` | exit 0 |
| Vet | `cd apps/api && go vet ./...` | exit 0 |
| Unit tests | `cd apps/api && go test ./...` | all `ok`, exit 0 |
| Integration (optional, needs Docker) | `make db-up && make migrate && make api-test-integration` | all pass |
| Live repro (optional, needs DB+server) | `curl -s -o /dev/null -w '%{http_code}' localhost:8080/v1/layouts/not-a-uuid` | `404` after the fix (was `500`) |

## Scope

**In scope** (the only files you should modify/create):
- `apps/api/internal/handler/common.go` (add `isUUID` + `uuidParams`)
- `apps/api/internal/handler/handler.go` (wrap parameterized routes)
- `apps/api/internal/handler/common_test.go` (create)
- `apps/api/internal/store/postgres/db.go` (add `classifyPgError`)
- `apps/api/internal/store/postgres/layout.go` (apply classification in `SaveScene`/`insertSeats` error paths)
- `apps/api/cmd/server/main.go` (unconditional registration)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `apps/api/internal/service/errors.go` — `mapError` stays as-is; classification happens at the store boundary (the postgres package is the only layer allowed to know about SQLSTATEs) and ID-format validation at the handler boundary. Do not import pgx from the service layer.
- Handler method bodies (`venue.go`, `layout.go`, `show.go`, `booking.go`, `category.go`) — the wrapper at registration covers them; do not edit each `PathValue` call.
- `pagination()` in common.go — negative limits are already clamped by the service layer; leave it.
- The uncommitted perf diff content (ETag probes, `ListSeatsJSON`) — leave exactly as found.

## Git workflow

- Repo rule (CLAUDE.md): **commit/push only when the operator asks.** Default: leave changes uncommitted.
- If commits requested: branch `advisor/002-error-classification` off `main`; message style `fix(api): 404 malformed ids, 409 unique violations, register routes unconditionally`; end with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Steps

### Step 1: Add UUID validation helpers to handler/common.go

Append to `apps/api/internal/handler/common.go`:

```go
// isUUID reports whether s looks like a canonical 36-char UUID
// (8-4-4-4-12 hex). All path IDs in this API are Postgres-generated UUIDs;
// rejecting other shapes up front turns driver-level 22P02 errors into clean
// 404s without a DB round-trip.
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i := 0; i < 36; i++ {
		c := s[i]
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			switch {
			case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
			default:
				return false
			}
		}
	}
	return true
}

// uuidParams wraps a handler, returning 404 early when any named path
// parameter is not a UUID. A malformed ID can never name a resource, so 404
// matches the not-found contract exactly (and avoids leaking which IDs exist).
func uuidParams(next http.HandlerFunc, names ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		for _, n := range names {
			if !isUUID(r.PathValue(n)) {
				httpx.WriteError(w, r, httpx.ErrNotFound("resource not found"))
				return
			}
		}
		next(w, r)
	}
}
```

Add `"github.com/akshat/seats/api/internal/httpx"` to common.go's imports.

**Verify**: `cd apps/api && go build ./...` → exit 0.

### Step 2: Wrap every parameterized route in RegisterV1

In `apps/api/internal/handler/handler.go`, wrap each of the 22 parameterized registrations (the exact list is in "Current state"); routes without `{...}` params (`GET /v1/venues`, `POST /v1/venues`) stay unwrapped. Examples of the mechanical transformation:

```go
	mux.HandleFunc("GET /v1/venues/{venueId}", uuidParams(v.get, "venueId"))
	mux.HandleFunc("GET /v1/layouts/{layoutId}", uuidParams(l.get, "layoutId"))
	mux.HandleFunc("GET /v1/shows/{showId}/seats", uuidParams(sh.seats, "showId"))
```

Every route has exactly one path parameter — pass exactly the name that appears in its pattern.

**Verify**: `cd apps/api && go build ./... && go vet ./...` → exit 0. Then `grep -c "uuidParams(" apps/api/internal/handler/handler.go` → `22`.

### Step 3: Classify Postgres constraint errors at the store boundary

In `apps/api/internal/store/postgres/db.go`, add:

```go
// classifyPgError maps driver-level SQLSTATEs onto the store's sentinel
// errors so the layers above never see raw pg errors for client-caused
// conditions. 23505 unique_violation -> ErrConflict (e.g. duplicate seat_uid
// within a layout); 22P02 invalid_text_representation -> ErrNotFound (a
// malformed UUID can never name a row; defense in depth behind handler-level
// validation).
func classifyPgError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return fmt.Errorf("%w: %s", store.ErrConflict, pgErr.ConstraintName)
		case "22P02":
			return store.ErrNotFound
		}
	}
	return err
}
```

with imports `"errors"`, `"fmt"`, `"github.com/jackc/pgx/v5/pgconn"`, `"github.com/akshat/seats/api/internal/store"` (add only the ones db.go doesn't already have).

In `apps/api/internal/store/postgres/layout.go`, route the two `SaveScene` write-error paths through it:
- the `fmt.Errorf("save scene: %w", err)` return (UPDATE … RETURNING failure), and
- the error return of `insertSeats` inside `SaveScene` — wrap as `classifyPgError(err)` so a `23505` from the bulk seat insert becomes `store.ErrConflict` (→ 409 via the existing `mapError`).

Pattern:

```go
	if len(seats) > 0 {
		if err := insertSeats(ctx, tx, id, seats); err != nil {
			return domain.Layout{}, classifyPgError(err)
		}
	}
```

**Verify**: `cd apps/api && go build ./... && go vet ./...` → exit 0.

### Step 4: Register API routes unconditionally at boot

In `apps/api/cmd/server/main.go`, replace the `if dbReachable { … } else { … }` block so routes are always registered; keep the ping purely as a startup log signal:

```go
	pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		log.Warn("database not reachable at startup; API will return errors until it comes up (readiness reports not-ready)", "err", err.Error())
	}
	cancel()
	registerAPIRoutes(mux, db, log)
```

(If plan 001 already ran, the call is `registerAPIRoutes(mux, stores, log)` — keep that form.) Remove the now-unused `dbReachable` variable. The health/readiness handler already reports DB state independently — do not change it.

**Verify**: `cd apps/api && go build ./... && go vet ./...` → exit 0, and `grep -n "dbReachable" apps/api/cmd/server/main.go` → no matches.

### Step 5: Tests

Create `apps/api/internal/handler/common_test.go`:

```go
package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsUUID(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"a3bb189e-8bf9-3888-9912-ace4e6543002", true},
		{"A3BB189E-8BF9-3888-9912-ACE4E6543002", true}, // uppercase accepted
		{"00000000-0000-0000-0000-000000000000", true},
		{"", false},
		{"not-a-uuid", false},
		{"a3bb189e8bf938889912ace4e6543002", false},      // no hyphens
		{"a3bb189e-8bf9-3888-9912-ace4e654300g", false},  // non-hex
		{"a3bb189e-8bf9-3888-9912-ace4e65430022", false}, // too long
		{"1; DROP TABLE layouts;--", false},
	}
	for _, c := range cases {
		if got := isUUID(c.in); got != c.want {
			t.Errorf("isUUID(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestUUIDParamsRejectsMalformed(t *testing.T) {
	called := false
	h := uuidParams(func(w http.ResponseWriter, r *http.Request) { called = true }, "layoutId")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/layouts/{layoutId}", h)

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/layouts/not-a-uuid", nil))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
	if called {
		t.Fatal("handler was called despite malformed id")
	}

	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/layouts/a3bb189e-8bf9-3888-9912-ace4e6543002", nil))
	if !called {
		t.Fatal("handler was not called for a valid uuid")
	}
}
```

(The second request will invoke the wrapped no-op handler — it writes no response, which is fine for this test.)

**Verify**: `cd apps/api && go test ./internal/handler/` → `ok`, new tests pass. Then `cd apps/api && go test ./...` → all pass.

### Step 6 (optional, only if Docker is available): live behavior check

`make db-up && make migrate`, start the server (`make api-dev`) in the background, then:
- `curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/v1/layouts/not-a-uuid` → `404`
- `curl -s localhost:8080/v1/layouts/not-a-uuid | grep -c not_found` → `1`
Stop the server afterwards.

## Test plan

- `internal/handler/common_test.go` (new): `isUUID` table test (valid lower/upper/nil-UUID; rejects empty, hyphen-less, non-hex, overlong, injection-shaped strings); `uuidParams` returns 404 without invoking the handler, and passes through valid IDs.
- Pattern to follow: table-driven stdlib tests as in `internal/config/config_test.go`.
- Constraint-classification (`23505` → 409) is exercised indirectly; a dedicated integration test is deferred (noted in Maintenance) since crafting a colliding scene requires a seeded DB.
- Verification: `cd apps/api && go test ./...` → all pass including the new file.

## Done criteria

ALL must hold:

- [ ] `cd apps/api && go build ./... && go vet ./... && go test ./...` exit 0; new handler tests pass
- [ ] `grep -c "uuidParams(" apps/api/internal/handler/handler.go` prints `22`
- [ ] `grep -n "dbReachable" apps/api/cmd/server/main.go` prints nothing
- [ ] `grep -n "pgconn" apps/api/internal/service/` prints nothing (layering preserved)
- [ ] `git status --porcelain` shows changes only in in-scope files (the pre-existing uncommitted perf diff in `apps/api` remains, untouched)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `RegisterV1` no longer matches the route table in "Current state" (routes added/renamed) — re-derive the wrap list only if the difference is additive; otherwise stop.
- Any route pattern has **two** path parameters (the wrapper supports it, but it means the API surface changed since planning — note it).
- `github.com/jackc/pgx/v5/pgconn` is not importable from the postgres package (`go build` failure on the import) — do not add any new module requirement; report instead.
- A test that passed before your change fails afterwards in a package outside Scope.

## Maintenance notes

- New endpoints with `{param}` path IDs must be registered through `uuidParams` — a reviewer checklist item; consider a lint note in CLAUDE.md later.
- If a future resource uses non-UUID public IDs (slugs), exempt only that route from the wrapper; don't weaken `isUUID`.
- `classifyPgError` is deliberately minimal (23505, 22P02). Extend with `23503` (foreign-key) only when a concrete endpoint needs it.
- Deferred follow-up (backlog): pre-validate duplicate seat UIDs in `domain.FlattenSeats` → 422 with the offending UID, which is friendlier than the 409 this plan produces; and an integration test for the 409 path.
- Reviewer scrutiny: confirm 404 (vs 400) for malformed IDs is the intended contract — chosen here to match "a malformed ID can never name a resource" and to avoid leaking ID-format hints.
