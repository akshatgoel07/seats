# Plan 006: Turn on TypeScript strict mode in apps/web, staged flag-by-flag

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3747b9a..HEAD -- apps/web/tsconfig.json apps/web/services apps/web/app`
> Then `grep -n '"strict"' apps/web/tsconfig.json` → expect `"strict": false`.
> If strict is already true, mark DONE-by-drift and stop.

## Status

- **Priority**: P2
- **Effort**: M–L (genuinely unknown until Stage B's error count is measured; the plan has an explicit budget gate)
- **Risk**: MED (null-guard fixes can change runtime behavior if done carelessly — the rules below exist to prevent that)
- **Depends on**: 004 recommended first (CI catches regressions automatically); not a hard dependency
- **Category**: tech-debt
- **Planned at**: commit `3747b9a`, 2026-06-10

## Why this matters

The web app was just migrated wholesale from JavaScript to TypeScript (PR #2, commit `3747b9a` — the current HEAD), but `tsconfig.json` ships with `"strict": false`, `"strictNullChecks": false`, `"noImplicitAny": false`. With those flags off, the migration is largely cosmetic: implicit `any` flows freely, null/undefined bugs the compiler exists to catch stay invisible, and the 57 explicit `any`-family escape hatches (worst offenders: `services/api.ts` — the entire API client is effectively untyped) never get pressure to shrink. The codebase renders customer-facing seat maps from server data; null-safety at that boundary is exactly what strictNullChecks buys. Doing this now, while the migration is fresh and the perf-stabilized code is well-tested, is the cheapest it will ever be.

## Current state

- `apps/web/tsconfig.json:20-22`:

```json
    "strict": false,
    "strictNullChecks": false,
    "noImplicitAny": false,
```

- Escape-hatch census at planning time (`grep -rn ': any\|as any\|@ts-ignore\|@ts-expect-error' app services lib --include='*.ts' --include='*.tsx' | wc -l` from `apps/web/`): **57**. Worst files: `services/api.ts` (9), `app/editor/components/properties/UIComponents.tsx` (8), `app/seat-layout/components/SeatPreview.tsx` (7), `app/seat-layout/components/svg-elements/SeatElement.tsx` (6), `app/globals.d.ts` (6).
- `apps/web/services/api.ts` — the API client; static methods over a `request()` helper; several untyped params and `: any = {}` defaults (e.g. `createBooking(showId, { holdId, seatUids, customer }: any = {})` around line 170). Responses arrive in the Go API's envelope `{"data": ...}` / `{"error": {"code","message"}}` and `request()` unwraps `payload.data`.
- **Source of truth for API payload types**: the Go domain structs' `json` tags in `apps/api/internal/domain/` — `scene.go` (Layout, Scene, RawScene), `show.go` (Show, SeatStatus), `flatten.go` (FlatSeat). Derive the TS interfaces from those tags; do not invent field names. Note `GET /v1/shows/{id}/seats` returns `{show, scene, seats, status}` (see `ShowSeats` in `apps/api/internal/service/show_service.go`).
- Gates: `pnpm typecheck` (tsc --noEmit), `pnpm test` (54+ node:test assertions over pure logic), `pnpm lint` (0 errors / ~32 warnings baseline), `pnpm build`.
- Editor state shape: `app/editor/types.ts` + reducer in `app/editor/reducer.ts` — already typed; strictNullChecks will surface optional-field access here.

## Commands you will need

| Purpose | Command (from `apps/web/`) | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Error count during a stage | `pnpm typecheck 2>&1 | grep -c "error TS"` | the number you triage |
| Errors by file | `pnpm typecheck 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -20` | triage list |
| Tests | `pnpm test` | all pass |
| Lint | `pnpm lint` | 0 errors |
| Build | `pnpm build` | `✓ Compiled successfully` |
| Hatch census | `grep -rn ': any\|as any\|@ts-ignore' app services lib --include='*.ts' --include='*.tsx' | wc -l` | must not exceed 57 |

## Scope

**In scope**:
- `apps/web/tsconfig.json` (the three flags; nothing else in it)
- Type-level changes across `apps/web/app/**`, `apps/web/services/**`, `apps/web/lib/**`: annotations, interfaces, generics, optional-chaining/guards, `unknown`+narrowing
- A new `apps/web/services/types.ts` (or types co-located in `services/api.ts`) for the API DTOs
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- **Runtime behavior.** This is the load-bearing boundary — see the fix rules in Step 3. No control-flow rewrites, no new thrown errors, no removed features, no renamed exports.
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — deliberately not enabled (another large error class; future ratchet).
- ESLint config, test harness (`app/test-setup.ts` — its global `expect` typing may need a small declaration fix; that is allowed), `next.config.mjs`.
- Fixing pre-existing logic bugs you discover — record them in your report instead (e.g. as candidates for the plans/README backlog).

## Git workflow

- Repo rule (CLAUDE.md): **commit/push only when the operator asks.**
- If commits requested: branch `advisor/006-ts-strict` off `main`; one commit per stage (`chore(web): enable noImplicitAny`, `chore(web): enable strictNullChecks`, `chore(web): enable strict`); end each with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Steps

### Step 0: Baseline

From `apps/web/`: `pnpm typecheck && pnpm test && pnpm lint && pnpm build` — all must pass **before** any change. Record the hatch census (expect 57).

**Verify**: all four gates exit 0.

### Step 1: Type the API client first (highest value, no flag flip yet)

In `services/api.ts` (+ optional `services/types.ts`): define interfaces derived from the Go domain structs (see "Current state" → source of truth): `Venue`, `Category`, `Layout`, `FlatSeat`, `Show`, `SeatStatus`, `Hold`, `Booking`, `ShowSeatsPayload`, and `ApiEnvelope<T> = { data: T; meta?: unknown }` / `ApiErrorBody = { error: { code: string; message: string } }`. Give every static method a typed signature and return type (`Promise<Layout>`, `Promise<ShowSeatsPayload>`, …). Remove the `: any = {}` defaults by typing the options objects.

Rule: where a Go field is a pointer or `omitempty`, the TS field is optional (`?`). Where the scene is `RawScene` (verbatim JSON), type it as a structural `Scene` interface only if one already exists in `app/editor/types.ts` — otherwise `unknown` with narrowing at the call sites that consume it.

**Verify**: `pnpm typecheck` exit 0 (flags still off — this must not introduce errors); `pnpm test` passes; hatch census in `services/` drops (was 9).

### Step 2: Stage A — `noImplicitAny: true`

Flip only that key in tsconfig.json. Triage with the errors-by-file command. Fix every error by **adding annotations** (parameter/return/variable types). Use `unknown` + a narrowing guard where the real type is genuinely dynamic; **never** silence with `: any` or `@ts-ignore` (the census gate enforces this).

**Verify**: `pnpm typecheck` exit 0 → then `pnpm test && pnpm build` pass → hatch census ≤ 57.

### Step 3: Stage B — `strictNullChecks: true`

Flip the key; measure first: `pnpm typecheck 2>&1 | grep -c "error TS"`.

**Budget gate**: if the count exceeds **200**, STOP and report the count and the by-file breakdown — the operator decides between pressing on, staging per-directory, or deferring. Below 200, proceed.

Fix rules (behavior preservation is the whole game):
1. If the value provably can't be null at that point (constructed above, guarded earlier) → non-null is fine via restructuring or a local guard; avoid bare `!` except where a comment can state the invariant in one line.
2. If runtime today would tolerate null (optional chaining elsewhere, `|| fallback` patterns) → mirror that: `?.`, `?? fallback`. **Choose the fallback the code already uses nearby, never invent a new default.**
3. If the type says nullable but every caller passes non-null → tighten the type at the source (parameter/field), not the use sites.
4. **Never** add a `throw` where code currently proceeds; never delete a runtime null-check just because the type says it's impossible.

**Verify**: `pnpm typecheck` exit 0 → `pnpm test` all pass → `pnpm build` succeeds → `pnpm lint` 0 errors → census ≤ 57.

### Step 4: Stage C — `strict: true`

Replace the three explicit lines with `"strict": true` (it implies the other two; keeping the file minimal). The remaining error classes are usually small: `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `useUnknownInCatchVariables` (catch blocks need `catch (err) { ... (err as Error) }`-style narrowing — prefer `err instanceof Error ? err.message : String(err)`).

**Verify**: `pnpm typecheck && pnpm test && pnpm lint && pnpm build` all exit 0.

### Step 5: Final census and sweep report

Run the hatch census; report the before/after (57 → N). List, per remaining `any`, a one-line justification or a TODO owner. Do not chase to zero — strict-on with honest residuals beats strict-on with lies.

## Test plan

No new test files required; the existing suites are the behavior lock: `pnpm test` must pass **unchanged** (same assertions) after every stage. If a test must change to keep passing, that is evidence of a behavior change — treat it as a STOP condition, not a test update.

Optional (recommended if cheap): add type-level smoke to `services/api.ts` usage sites — e.g. in `app/seat-layout/hooks/useSeatLayout.ts`, the payload fields the hook reads should now autocomplete; a wrong field name must fail `pnpm typecheck`.

## Done criteria

ALL must hold:

- [ ] `apps/web/tsconfig.json` has `"strict": true` (and no `strict*: false` overrides)
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` passes with **unmodified** test assertions
- [ ] `pnpm build` succeeds; `pnpm lint` has 0 errors
- [ ] Escape-hatch census ≤ 57 and `git grep -n "@ts-ignore" apps/web -- '*.ts' '*.tsx'` adds no new occurrences
- [ ] `services/api.ts` has no `any` in public method signatures
- [ ] `git status --porcelain` touches only in-scope paths
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Stage B error count > 200 (budget gate — report the breakdown).
- Any existing test fails and the fix would require changing the test's assertions or the runtime code's behavior.
- You find yourself adding `as unknown as X` more than ~5 times — the types are fighting reality somewhere upstream; report the cluster instead of laundering it.
- `app/globals.d.ts` declarations conflict with strict mode in a way that requires changing the test harness contract.

## Maintenance notes

- After this lands, new code is strict by default — the main regression vector is someone re-adding `: any` in review; the census command above is a one-line ratchet check (CI could enforce `<= N` later).
- The typed API client (`services/api.ts`) becomes the de-facto API contract mirror; when the Go API adds fields, update the interfaces in the same PR (source of truth: `apps/api/internal/domain/` json tags).
- Deferred ratchets, in order of value: `noUncheckedIndexedAccess` (seat maps index by id constantly — real bugs hide here, but the error volume is large), then `exactOptionalPropertyTypes`.
- Reviewer scrutiny: every `!` non-null assertion added in Stage B (each should carry its one-line invariant), and any place a `?? fallback` introduced a default that didn't exist before (rule 2 violation).
