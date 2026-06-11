# Plan 001: Expire stale holds automatically so abandoned holds stop blocking seats forever

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3747b9a..HEAD -- apps/api/cmd/server apps/api/internal/store/postgres/booking.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but plan 002 also edits `cmd/server/main.go` + `cmd/server/routes.go` — execute 001 and 002 sequentially, not in parallel, and re-run the later plan's drift check)
- **Category**: bug
- **Planned at**: commit `3747b9a`, 2026-06-10

## Why this matters

The API places time-bounded holds on seats (`POST /v1/shows/{showId}/holds`, default TTL 300s). A hold marks its seats `state = SeatHeld` in `seat_status`. The store has an `ExpireDueHolds` method that frees seats of lapsed holds — **but nothing in the running server ever calls it**. It is only invoked directly by an integration test. Consequences in production:

1. Any hold that a customer abandons (closes the tab, never books) keeps its seats unavailable **forever**. `CreateHold` and direct `CreateBooking` both reject seats whose state is not `SeatAvailable`, with no check of the owning hold's expiry. Inventory leaks permanently until someone manually calls `DELETE /v1/holds/{id}`.
2. The seats-payload ETag (uncommitted work in `internal/service/show_service.go`) derives freshness from `seat_status.updated_at`. `ExpireDueHolds` writes `updated_at = now()` when freeing seats, so running it periodically is also what makes hold expiry visible to ETag-polling clients.

The fix is a small background sweeper goroutine in the server entrypoint that calls the existing, already-integration-tested store method on a ticker.

## Current state

Relevant files:

- `apps/api/internal/store/postgres/booking.go` — holds/bookings store. `ExpireDueHolds` (lines 179–206) is complete and correct: one transaction that frees seats (`UPDATE seat_status … SET state = available, hold_id = NULL, updated_at = now() … WHERE h.status = 'active' AND h.expires_at <= now()`) and marks holds `expired`. **Do not modify this file.**
- `apps/api/internal/store/store.go` — `BookingStore` interface already declares `ExpireDueHolds(ctx context.Context) (int, error)` (around line 101).
- `apps/api/cmd/server/main.go` — server entrypoint; no background jobs exist today.
- `apps/api/cmd/server/routes.go` — builds stores + services and registers routes:

```go
// apps/api/cmd/server/routes.go:15-19 (entire wiring)
func registerAPIRoutes(mux *http.ServeMux, db *postgres.DB, log *slog.Logger) {
	stores := postgres.NewStores(db)
	svcs := service.New(stores)
	handler.RegisterV1(mux, svcs, log)
}
```

- `apps/api/cmd/server/main.go:47-77` (the region you will edit):

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

	// Fall back to a JSON 404 for unmatched routes.
	mux.Handle("/", httpx.NotFoundHandler())

	root := httpx.Wrap(mux, cfg, log, nil /* authenticator wired later */)

	srv := &http.Server{
		Addr:         cfg.Addr(),
		Handler:      root,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	}

	serverErr := make(chan error, 1)
	go func() {
```

- `postgres.NewStores(db)` returns `store.Stores`, a struct whose `Bookings` field is a `store.BookingStore` interface value (`apps/api/internal/store/postgres/stores.go:7-15`).
- Proof of the gap: `grep -rn "ExpireDueHolds" apps/api --include='*.go'` matches only the interface declaration, the postgres implementation, and `integration_test.go:209`. No call site in `cmd/` or `internal/service/`.
- Existing integration coverage: `apps/api/internal/store/postgres/integration_test.go:194-219` `TestHoldExpiryFreesSeat` (creates a ttl=0 hold, calls `ExpireDueHolds`, asserts the seat can be re-held). It remains the behavioral test for the store method.

Repo conventions that apply: standard library only (plus pgx, already present) — **no new dependencies**; structured logging via `log/slog` with lowercase snake_case keys (see `main.go` and `httpx/middleware.go:98-106` for style); comments explain "why", not "what".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `cd apps/api && go build ./...` | exit 0, no output |
| Vet | `cd apps/api && go vet ./...` | exit 0, no output |
| Unit tests | `cd apps/api && go test ./...` | `ok` for every package, exit 0 |
| Integration tests (optional, needs DB) | `make db-up && make migrate && make api-test-integration` | all pass |

Unit tests do not need a database. Integration tests need Docker.

## Scope

**In scope** (the only files you should modify/create):
- `apps/api/cmd/server/main.go` (modify)
- `apps/api/cmd/server/routes.go` (modify — signature change)
- `apps/api/cmd/server/sweep.go` (create)
- `apps/api/cmd/server/sweep_test.go` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `apps/api/internal/store/postgres/booking.go` — `ExpireDueHolds` is already correct and integration-tested.
- `apps/api/internal/store/store.go` — the interface already declares the method.
- Lazy expiry inside `lockAndCheckAvailable` (treating expired-hold seats as available at read time) — a deliberate non-goal; one expiry mechanism, not two.
- Anything in `internal/httpx/` or `internal/service/` (ETag behavior is plan 003's territory).
- The uncommitted perf changes elsewhere in `apps/api` — leave them exactly as they are.

## Git workflow

- This repo's rule (CLAUDE.md): **commit/push only when the operator asks.** Default: leave changes uncommitted in the working tree.
- If the operator asked for commits: branch `advisor/001-expire-stale-holds` off `main`, conventional message style matching `git log` (e.g. `fix(api): sweep expired holds so abandoned holds free their seats`), and end the message with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Steps

### Step 1: Hoist store construction out of registerAPIRoutes

In `apps/api/cmd/server/routes.go`, change the signature so the caller supplies the stores (the sweeper needs them too):

```go
func registerAPIRoutes(mux *http.ServeMux, stores store.Stores, log *slog.Logger) {
	svcs := service.New(stores)
	handler.RegisterV1(mux, svcs, log)
}
```

Update imports: remove `"github.com/akshat/seats/api/internal/store/postgres"`, add `"github.com/akshat/seats/api/internal/store"`.

In `apps/api/cmd/server/main.go`, inside `run`, immediately after the `db, err := postgres.New(...)` block, add:

```go
	stores := postgres.NewStores(db)
```

and change the call site to `registerAPIRoutes(mux, stores, log)`.

**Verify**: `cd apps/api && go build ./...` → exit 0.

### Step 2: Add the sweeper

Create `apps/api/cmd/server/sweep.go`:

```go
package main

import (
	"context"
	"log/slog"
	"time"
)

// holdExpirer is the slice of the booking store the sweeper needs; narrow so
// tests can fake it.
type holdExpirer interface {
	ExpireDueHolds(ctx context.Context) (int, error)
}

// sweepHolds periodically releases holds whose TTL has lapsed, freeing their
// seats. Without it, abandoned holds block seats forever (nothing else expires
// them). It also bumps seat_status.updated_at, which is what makes expiry
// visible to ETag-polling clients. Runs until ctx is cancelled.
func sweepHolds(ctx context.Context, log *slog.Logger, b holdExpirer, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n, err := b.ExpireDueHolds(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Warn("hold sweep failed", "err", err.Error())
				continue
			}
			if n > 0 {
				log.Info("expired holds released", "count", n)
			}
		}
	}
}
```

**Verify**: `cd apps/api && go build ./... && go vet ./...` → exit 0.

### Step 3: Start the sweeper in run()

In `apps/api/cmd/server/main.go`, after the `stores := postgres.NewStores(db)` line from Step 1, add:

```go
	// Sweep expired holds in the background; 10s bounds how long a lapsed hold
	// can keep seats unavailable (default hold TTL is 300s).
	sweepCtx, stopSweep := context.WithCancel(context.Background())
	defer stopSweep()
	go sweepHolds(sweepCtx, log, stores.Bookings, 10*time.Second)
```

Start it unconditionally (not inside the `if dbReachable` branch): if the DB is down, each tick logs a warning and retries — that is the desired behavior while waiting for the DB to come up.

**Verify**: `cd apps/api && go build ./...` → exit 0, and `grep -n "go sweepHolds" apps/api/cmd/server/main.go` → exactly one match.

### Step 4: Unit-test the sweeper loop

Create `apps/api/cmd/server/sweep_test.go` with a fake expirer (no DB). Model the style on `apps/api/internal/httpx/httpx_test.go` (plain `testing`, no test frameworks):

```go
package main

import (
	"context"
	"errors"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

type fakeExpirer struct {
	calls atomic.Int64
	err   error
}

func (f *fakeExpirer) ExpireDueHolds(ctx context.Context) (int, error) {
	f.calls.Add(1)
	return 1, f.err
}

func TestSweepHoldsTicksAndStops(t *testing.T) {
	f := &fakeExpirer{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		sweepHolds(ctx, slog.Default(), f, 5*time.Millisecond)
		close(done)
	}()

	deadline := time.After(2 * time.Second)
	for f.calls.Load() < 2 {
		select {
		case <-deadline:
			t.Fatalf("sweeper ticked %d times, want >= 2", f.calls.Load())
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("sweeper did not stop after context cancellation")
	}
}

func TestSweepHoldsSurvivesErrors(t *testing.T) {
	f := &fakeExpirer{err: errors.New("db down")}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go sweepHolds(ctx, slog.Default(), f, 5*time.Millisecond)

	deadline := time.After(2 * time.Second)
	for f.calls.Load() < 2 {
		select {
		case <-deadline:
			t.Fatalf("sweeper stopped retrying after an error: %d calls, want >= 2", f.calls.Load())
		case <-time.After(5 * time.Millisecond):
		}
	}
}
```

**Verify**: `cd apps/api && go test ./cmd/server/` → `ok`, both new tests pass.

### Step 5: Full gates

**Verify**: `cd apps/api && go vet ./... && go test ./...` → exit 0, all packages `ok`.
If Docker is available, also run `make db-up && make migrate && make api-test-integration` → all pass (including the pre-existing `TestHoldExpiryFreesSeat`).

## Test plan

- New: `cmd/server/sweep_test.go` — (a) sweeper calls `ExpireDueHolds` repeatedly and stops on context cancel; (b) sweeper keeps retrying after errors. Pattern: plain stdlib `testing` like `internal/httpx/httpx_test.go`.
- Existing (unchanged): `internal/store/postgres/integration_test.go:194` `TestHoldExpiryFreesSeat` covers the SQL semantics of `ExpireDueHolds`.
- Verification: `cd apps/api && go test ./...` → all pass, 2 new tests included.

## Done criteria

ALL must hold:

- [ ] `cd apps/api && go build ./... && go vet ./...` exits 0
- [ ] `cd apps/api && go test ./...` exits 0; `TestSweepHoldsTicksAndStops` and `TestSweepHoldsSurvivesErrors` exist and pass
- [ ] `grep -rn "ExpireDueHolds" apps/api/cmd/server/` shows the sweeper call path (sweep.go); `grep -n "go sweepHolds" apps/api/cmd/server/main.go` → 1 match
- [ ] `git status --porcelain` shows changes only in the in-scope files (plus the pre-existing uncommitted perf diff in `apps/api`, which you must leave untouched)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `ExpireDueHolds` no longer exists on `store.BookingStore` or its signature differs from `(ctx context.Context) (int, error)`.
- `cmd/server/main.go` no longer contains the `dbReachable` block shown in "Current state" (the file has been restructured — likely plan 002 ran first; re-read the file, apply the same logic at the equivalent point, and note the deviation in your report).
- `go test ./...` fails in a package you did not touch (pre-existing breakage — report it, don't fix it).
- You find an existing call to `ExpireDueHolds` outside tests (the bug may already be fixed; report and mark the plan REJECTED in the index).

## Maintenance notes

- If the API is later deployed as multiple replicas, every replica runs the sweeper. `ExpireDueHolds` is a single transaction with row locks, so this is safe — just redundant. Fine at this scale; revisit (leader election or `FOR UPDATE SKIP LOCKED`) only if sweep contention shows up.
- The 10s interval bounds availability staleness after a hold lapses. If product wants tighter bounds, lower the interval; the query is cheap (partial index `idx_holds_active_expiry` exists in `0001_init.sql:85`).
- Reviewer should scrutinize: the sweeper must not hold up graceful shutdown (it doesn't — `stopSweep` via defer, and `srv.Shutdown` doesn't wait on it).
- Deferred (deliberately): lazy expiry at read time in `lockAndCheckAvailable`; per-client hold caps (see plans/README backlog).
