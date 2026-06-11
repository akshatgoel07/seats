# Plan 003: Harden and test the in-flight API perf work (gzip, ETag/304, json_agg) so it can land

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: This plan targets work that was **UNCOMMITTED
> in the working tree** at planning time (HEAD `3747b9a` + dirty `apps/api`).
> Run:
> 1. `grep -n "func Gzip()" apps/api/internal/httpx/middleware.go` → must match (~line 276)
> 2. `grep -n "func CheckETag" apps/api/internal/httpx/respond.go` → must match (~line 56)
> 3. `grep -n "ShowSeatsETag" apps/api/internal/service/show_service.go` → must match
>
> If any grep finds nothing, the in-flight work is absent from your checkout
> (e.g. you are in a fresh worktree created from a commit that predates it) —
> **STOP and report**; this plan cannot run there. If the greps match but
> `git status --porcelain apps/api` is clean, the work was committed since
> planning — fine, proceed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none strictly; plan 001's sweeper is what makes hold-expiry visible to the ETag (see Maintenance) — recommended first
- **Category**: perf + tests
- **Planned at**: commit `3747b9a` + uncommitted diff, 2026-06-10

## Why this matters

The working tree carries a deliberate API-latency optimization set: a gzip middleware (~9× shrink on the repetitive multi-MB seat/scene JSON), ETag/304 conditional gets on the two hot read endpoints, Postgres-side `json_agg` serialization of seats/statuses, and a scene JSONB→TEXT migration. It is good work, but it is **entirely untested** (`internal/httpx/httpx_test.go` has zero references to Gzip or CheckETag) and has four known defects/rough edges found in review. Untested + uncommitted means it can silently rot or ship broken. This plan fixes the defects, adds the missing tests, and brings the change-set to a committable state.

The four issues to fix:

1. **Duplicate `Vary: Accept-Encoding`.** `CheckETag` (respond.go:59) does `Header().Add("Vary", "Accept-Encoding")` and the gzip path (middleware.go:332) adds it again → 200s on ETag'd endpoints carry the value twice.
2. **`Flush()` loses buffered bytes.** `gzipResponseWriter.Flush` (middleware.go:375-382) flushes the gzip writer and the underlying writer but ignores `g.buf` — a handler that writes <1KB and calls Flush gets nothing on the wire until the request ends. No current endpoint streams, but the type advertises `http.Flusher`, so it must be correct (a future SSE endpoint would hit this immediately).
3. **`writeJSON` discards encode errors silently** (respond.go:50). The streaming choice is sound (status is already sent; nothing can be done for the client), but the server should at least log it.
4. **Redundant `GetShow` query.** `seats()` (handler/show.go:72-88) calls `ShowSeatsETag` (which runs `GetShow`) and then, on miss, `GetShowSeats` (which runs `GetShow` again) — 2 of the ~7 sequential queries on the hottest endpoint are duplicates.

## Current state

All excerpts verified against the working tree at planning time.

- `apps/api/internal/httpx/middleware.go` — middleware chain; the gzip implementation is lines ~257–382:
  - `Gzip()` wraps when `Accept-Encoding` contains gzip; `gzipResponseWriter` defers `WriteHeader`, buffers up to `gzipMinSize = 1024` bytes, and on `decideAndWrite` compresses only when `Content-Type` contains `application/json`.
  - `decideAndWrite` (line ~328): `g.Header().Add("Vary", "Accept-Encoding")` ← duplicate source #1.
  - `finalize()` (line ~357) flushes a sub-threshold body uncompressed; `Flush()` (line ~375):

```go
func (g *gzipResponseWriter) Flush() {
	if g.gz != nil {
		_ = g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
```

  - Note: the CORS middleware (line ~142) does `w.Header().Add("Vary", "Origin")` — any de-dup helper must preserve multi-value Vary, not `Set` over it.
- `apps/api/internal/httpx/respond.go`:

```go
// respond.go:42-51
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Stream-encode straight to the writer ... [comment]
	_ = json.NewEncoder(w).Encode(payload)
}

// respond.go:56-65
func CheckETag(w http.ResponseWriter, r *http.Request, etag string) bool {
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, must-revalidate")
	w.Header().Add("Vary", "Accept-Encoding")        // ← duplicate source #2
	if match := r.Header.Get("If-None-Match"); match != "" && match == etag {
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	return false
}
```

- `apps/api/internal/handler/show.go:72-88` — `seats()` calls `h.shows.ShowSeatsETag(...)`, then `httpx.CheckETag`, then on miss `h.shows.GetShowSeats(...)`.
- `apps/api/internal/service/show_service.go`:
  - `GetShowSeats(ctx, showID)` (line ~62): `GetShow` → `GetLayout` → `ListSeatsJSON` → `SeatStatusesJSON`, returns `ShowSeats{Show, Scene, Seats, Status}` where Seats/Status are `json.RawMessage`.
  - `ShowSeatsETag(ctx, showID)` (line ~85): `GetShow` → `GetVersion(layoutID)` → `SeatStatusVersion(showID)`, returns `fmt.Sprintf("\"%s-v%d-%s\"", showID, ver, statusVer)`.
- `apps/api/internal/httpx/httpx_test.go` — existing test style: stdlib `testing` + `httptest.NewRecorder`, e.g. `TestWriteJSON` asserts status, Content-Type, and envelope shape. Model all new tests on this file.
- `internal/store/postgres/show.go` `SeatStatusVersion` builds the freshness token as `count(*) || '-' || max(epoch(updated_at))::bigint` — 1-second granularity (see Maintenance).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `cd apps/api && go build ./...` | exit 0 |
| Vet | `cd apps/api && go vet ./...` | exit 0 |
| Unit tests | `cd apps/api && go test ./...` | all `ok`, exit 0 |
| Focused | `cd apps/api && go test ./internal/httpx/ -run 'Gzip\|ETag' -v` | new tests listed, PASS |
| Live check (optional, needs DB+server) | `curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' localhost:8080/v1/shows/<id>/seats` | one `Vary: Accept-Encoding`, `Content-Encoding: gzip`, `ETag` present |

## Scope

**In scope** (the only files you should modify/create):
- `apps/api/internal/httpx/middleware.go` (Vary helper use, Flush fix)
- `apps/api/internal/httpx/respond.go` (Vary helper use, encode-error logging, comment)
- `apps/api/internal/httpx/middleware_gzip_test.go` (create)
- `apps/api/internal/handler/show.go` (`seats()` — use the show returned by the ETag path)
- `apps/api/internal/service/show_service.go` (`ShowSeatsETag` returns the show; add `GetShowSeatsFor`)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `apps/api/internal/store/**` — the json_agg queries, `SeatStatusVersion`, and migration `0002_scene_text.sql` are correct as-is (the migration is idempotent and the migration runner tracks applied files).
- The ETag **scheme** (no hashing, no transaction-snapshot atomicity). The etag→payload gap between the two reads is benign: the worst case is one unnecessary 200 or one poll-cycle of staleness, self-healing on the next request. Document, don't redesign.
- `handler/layout.go` `get()` — its single-resource version probe has no duplicate-query problem; leave it.
- Rate limiting, CORS, auth, `writeJSON`'s streaming approach itself (keep streaming; only add logging).

## Git workflow

- Repo rule (CLAUDE.md): **commit/push only when the operator asks.** This plan's output is a clean, tested working tree; the operator decides when to commit the whole perf change-set (suggest message: `perf(api): gzip + conditional 304s + postgres-side json serialization for hot reads`), ending with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Steps

### Step 1: Add a Vary helper and use it in both places

In `apps/api/internal/httpx/respond.go`, add:

```go
// addVary appends a value to the Vary header unless already present.
// Add-if-absent (never Set) because middlewares contribute independent Vary
// values (CORS adds "Origin", gzip adds "Accept-Encoding").
func addVary(h http.Header, value string) {
	for _, existing := range h.Values("Vary") {
		for _, part := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(part), value) {
				return
			}
		}
	}
	h.Add("Vary", value)
}
```

(add `"strings"` to imports). Replace `w.Header().Add("Vary", "Accept-Encoding")` in `CheckETag` with `addVary(w.Header(), "Accept-Encoding")`, and `g.Header().Add("Vary", "Accept-Encoding")` in `decideAndWrite` (middleware.go) with `addVary(g.Header(), "Accept-Encoding")`.

**Verify**: `cd apps/api && go build ./...` → exit 0.

### Step 2: Fix Flush() to force a decision and drain the buffer

Replace the `Flush` method in `apps/api/internal/httpx/middleware.go` with:

```go
// Flush implements http.Flusher. A Flush forces the compress/no-compress
// decision with whatever has been written so far (otherwise sub-threshold
// bytes would sit in g.buf and never reach a streaming client).
func (g *gzipResponseWriter) Flush() {
	if !g.decided {
		first := g.buf
		g.buf = nil
		if len(first) > 0 {
			g.decideAndWrite(first)
		} else {
			g.decided = true
			g.writeStatus()
		}
	}
	if g.gz != nil {
		_ = g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
```

Note `finalize()` already handles the `decided && gz == nil` and `decided && gz != nil` end states correctly after this change (`g.buf` is nil once decided).

**Verify**: `cd apps/api && go build ./... && go vet ./...` → exit 0.

### Step 3: Log writeJSON encode failures

In `apps/api/internal/httpx/respond.go` `writeJSON`, replace the final line:

```go
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// Status is already on the wire; nothing can be done for this client.
		// Log so a marshal bug (e.g. a broken MarshalJSON) is visible server-side.
		slog.Error("response encode failed", "err", err.Error())
	}
```

(`log/slog` is already imported in respond.go.)

**Verify**: `cd apps/api && go build ./...` → exit 0.

### Step 4: Eliminate the duplicate GetShow on the seats endpoint

In `apps/api/internal/service/show_service.go`:

1. Change `ShowSeatsETag` to return the show it already fetched:

```go
func (s *ShowService) ShowSeatsETag(ctx context.Context, showID string) (string, domain.Show, error) {
	sh, err := s.shows.GetShow(ctx, showID)
	if err != nil {
		return "", domain.Show{}, mapError(err)
	}
	ver, err := s.layouts.GetVersion(ctx, sh.LayoutID)
	if err != nil {
		return "", domain.Show{}, mapError(err)
	}
	statusVer, err := s.shows.SeatStatusVersion(ctx, showID)
	if err != nil {
		return "", domain.Show{}, mapError(err)
	}
	return fmt.Sprintf(`"%s-v%d-%s"`, showID, ver, statusVer), sh, nil
}
```

2. Split the payload builder so it can start from an already-fetched show; keep the old entry point delegating:

```go
// GetShowSeats returns the full render payload for a show ID.
func (s *ShowService) GetShowSeats(ctx context.Context, showID string) (ShowSeats, error) {
	sh, err := s.shows.GetShow(ctx, showID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	return s.GetShowSeatsFor(ctx, sh)
}

// GetShowSeatsFor builds the render payload for an already-fetched show,
// avoiding a second GetShow when the caller just computed the ETag.
func (s *ShowService) GetShowSeatsFor(ctx context.Context, sh domain.Show) (ShowSeats, error) {
	layout, err := s.layouts.GetLayout(ctx, sh.LayoutID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	seats, err := s.layouts.ListSeatsJSON(ctx, sh.LayoutID)
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	status, err := s.shows.SeatStatusesJSON(ctx, showIDOf(sh))
	if err != nil {
		return ShowSeats{}, mapError(err)
	}
	return ShowSeats{Show: sh, Scene: layout.Scene, Seats: seats, Status: status}, nil
}
```

Use `sh.ID` directly instead of a `showIDOf` helper (shown only to flag the one field you need — check `domain.Show`'s field name in `apps/api/internal/domain/show.go`; it is `ID`).

3. In `apps/api/internal/handler/show.go` `seats()`:

```go
func (h *ShowHandler) seats(w http.ResponseWriter, r *http.Request) {
	showID := r.PathValue("showId")
	etag, sh, err := h.shows.ShowSeatsETag(r.Context(), showID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if httpx.CheckETag(w, r, etag) {
		return // 304 Not Modified
	}
	payload, err := h.shows.GetShowSeatsFor(r.Context(), sh)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, payload)
}
```

4. Add a comment above `ShowSeatsETag` documenting the known validator limitations (so they are conscious choices, not surprises):

```go
// Known limitations of this validator (acceptable for private,
// must-revalidate caching): updated_at has 1-second granularity, and a
// same-second change that also keeps count(*) identical produces the same
// token, so a client can miss one update until the next write. Hold expiry
// only becomes visible when the background sweeper frees seats (it bumps
// updated_at) — see cmd/server/sweep.go.
```

(If plan 001 hasn't run yet, reference `ExpireDueHolds` instead of the sweep.go path.)

**Verify**: `cd apps/api && go build ./... && go vet ./... && go test ./...` → exit 0. `grep -c "GetShow(ctx" apps/api/internal/service/show_service.go` — `GetShowSeatsFor` must contain no `GetShow` call.

### Step 5: Add the missing tests

Create `apps/api/internal/httpx/middleware_gzip_test.go`, modeled on `httpx_test.go` (stdlib `testing` + `httptest`). Cover, at minimum:

1. **Large JSON gets compressed**: handler writes `Content-Type: application/json` + a >1KB JSON body; client sends `Accept-Encoding: gzip`. Assert `Content-Encoding: gzip`, exactly one `Vary` value equal to `Accept-Encoding` (use `resp.Header.Values("Vary")` and also guard against a single comma-joined duplicate), and that gunzipping the body (`compress/gzip` + `io.ReadAll`) round-trips to the original bytes.
2. **Small body is not compressed**: <1KB JSON → no `Content-Encoding` header; body arrives verbatim.
3. **No Accept-Encoding → passthrough**: large JSON, no header → uncompressed, body intact.
4. **Non-JSON is not compressed**: >1KB `text/plain` with `Accept-Encoding: gzip` → no `Content-Encoding`.
5. **Status preserved**: handler sets 201 then writes a large JSON body → client sees 201 (the deferred WriteHeader path).
6. **CheckETag + Gzip together**: a handler that calls `CheckETag(w, r, "\"x-v1\"")` then writes large JSON. First request (no If-None-Match): 200, ETag header set, exactly one `Vary: Accept-Encoding`. Second request with `If-None-Match: "x-v1"`: 304, empty body, no `Content-Encoding`.
7. **Flush drains sub-threshold writes**: handler writes ~100 bytes of JSON, calls `w.(http.Flusher).Flush()`, then blocks on a channel until the test confirms receipt. Use `httptest.NewServer` (not `NewRecorder` — you need real streaming) and a `bufio.Reader` on the response body to assert the first bytes arrive **before** the handler returns. Then unblock and assert the remainder. This is the regression test for the Step 2 fix.
8. **CheckETag unit tests** (same file or appended to `httpx_test.go`): match → returns true, 304 written, `ETag`+`Cache-Control` set; no match → returns false, nothing written yet; second call with different etag value behaves independently.

Wrap handlers as `Chain(handler, Gzip())` or `Gzip()(handler)` — see `Chain` in middleware.go:24.

**Verify**: `cd apps/api && go test ./internal/httpx/ -v -run 'Gzip\|ETag\|Flush'` → all new tests PASS. Then `go test ./...` → all pass.

### Step 6 (optional, needs Docker): live smoke

`make db-up && make migrate && make api-dev` (background), create a venue→layout→show via curl or use an existing one, then:
- `curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' localhost:8080/v1/shows/<showId>/seats` → `Content-Encoding: gzip`, single `Vary: Accept-Encoding`, an `ETag`.
- Repeat with `-H 'If-None-Match: <that etag>'` → `HTTP/1.1 304`.
Stop the server.

## Test plan

Detailed in Step 5 — 8 scenarios in `internal/httpx/middleware_gzip_test.go` (+ CheckETag units). Pattern: `internal/httpx/httpx_test.go`. Verification: `cd apps/api && go test ./...` all pass; the Flush test fails if Step 2 is reverted (check this by mentally confirming the test reads bytes mid-handler).

## Done criteria

ALL must hold:

- [ ] `cd apps/api && go build ./... && go vet ./... && go test ./...` exit 0
- [ ] New gzip/ETag/Flush tests exist in `internal/httpx/` and pass
- [ ] `grep -rn 'Add("Vary"' apps/api/internal/httpx/` → only the single `h.Add("Vary", value)` inside `addVary` (and CORS's `Add("Vary", "Origin")` in middleware.go, which is allowed)
- [ ] In `seats()` flow, `GetShow` runs once per request: `GetShowSeatsFor` contains no `GetShow` call
- [ ] `git status --porcelain` shows changes only in in-scope files (on top of the pre-existing perf diff)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift-check greps fail (in-flight work absent — see header).
- `gzipResponseWriter`'s structure differs materially from the excerpt (fields renamed/removed) — the Flush replacement would be wrong; report.
- Any existing test in `internal/httpx/` starts failing for reasons unrelated to your edits.
- The Flush streaming test (scenario 7) proves impossible with `httptest.NewServer` after two honest attempts — report with what you observed instead of weakening the test to a recorder-based non-streaming assertion.

## Maintenance notes

- **This change-set is uncommitted.** After this plan passes its gates, the natural next step is for the operator to commit the whole perf set (plus migration `0002_scene_text.sql`, which is new/untracked — `git add` it explicitly).
- The ETag validator intentionally trades precision for cheapness (1s granularity, count+max(updated_at)). If polling clients ever report missed updates, the next strengthening step is an `xmin`-based or trigger-maintained version column — do not reach for hashing the payload (defeats the purpose).
- Plan 001's sweeper is what makes hold expiry bump `updated_at`; without it, 304s correctly reflect the *stored* state but that stored state itself goes stale (the actual bug lives in plan 001's territory, not here).
- If an SSE/streaming endpoint is added later (see plans/README backlog "availability push"), scenario 7's semantics become load-bearing — keep that test green.
- Reviewer scrutiny: the `Flush` decision path (forced decision with empty buffer writes the status line with no Content-Encoding — correct, since nothing was written), and that `finalize()` still puts pooled gzip writers back exactly once.
