# Plan 004: Add a root CI pipeline that runs both apps' verification gates on every push/PR

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3747b9a..HEAD -- .github apps/web/.github Makefile apps/web/package.json`
> If `.github/workflows/` already exists at the repo root with a CI workflow,
> STOP — reconcile instead of duplicating.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (running CI green is easier after 001–003 land, but the workflow itself can merge first — it validates whatever is on the branch)
- **Category**: dx / tests
- **Planned at**: commit `3747b9a`, 2026-06-10

## Why this matters

The repo has good local verification gates (Go vet/build/test + integration tests; web typecheck/lint/test/build) but **nothing runs them automatically** — there is no `.github/` at the repo root. The only workflow file in the repo sits at `apps/web/.github/workflows/react-doctor.yml`, which GitHub never executes (GitHub Actions only reads workflows from the repository root), so it provides a false sense of coverage while pinning a third-party action to `@main`. Every audit finding in `plans/` relies on these gates as done-criteria; automating them is the cheapest way to keep all later changes honest.

## Current state

- `git ls-files | grep '^\.github'` → no matches (no root `.github/`).
- `apps/web/.github/workflows/react-doctor.yml` — dead workflow (wrong location). Content: triggers on `pull_request`, runs `uses: millionco/react-doctor@main` (unpinned). It has never run.
- Verification commands (all verified working during the audit):
  - API (from `apps/api/`): `go vet ./...`, `go build ./...`, `go test ./...`; integration tests are build-tagged: `go test -tags=integration ./...` and require Postgres + migrations (`go run ./cmd/migrate`).
  - Web (from `apps/web/`): `pnpm typecheck` (tsc --noEmit), `pnpm lint` (eslint — currently 0 errors / ~32 warnings; warnings do not fail it), `pnpm test` (Node built-in runner: `node --test --import ./app/test-setup.ts "app/**/*.test.ts"` — needs Node ≥ 22.6 for TS type-stripping; use Node 24), `pnpm build`.
- Toolchain facts: `apps/api/go.mod` declares `go 1.25.3`. `apps/web/pnpm-lock.yaml` is `lockfileVersion: '9.0'` → pnpm 9.x. There is also a stray `apps/web/package-lock.json` (npm) — **ignore it; pnpm is this repo's manager** (Makefile and CLAUDE.md use pnpm). `package.json` has no `packageManager` field (backlog item, not this plan).
- Postgres for integration tests: docker-compose uses `postgres:16-alpine` with user/password/db all `seatlayout`, port 5432, healthcheck `pg_isready -U seatlayout -d seatlayout`. The API reads `DATABASE_URL` (default `postgres://seatlayout:seatlayout@localhost:5432/seatlayout?sslmode=disable`).
- The repo's remote is GitHub (`origin`), PRs exist in history (`#1`, `#2`) — Actions will pick the workflow up on the next push once merged.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| YAML sanity | `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` | `ok` (macOS ships ruby; if unavailable, use `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'));print('ok')"`; if neither works, note it and rely on actionlint or careful review) |
| Local equivalence (api) | `cd apps/api && go vet ./... && go build ./... && go test ./...` | exit 0 |
| Local equivalence (web) | `cd apps/web && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | exit 0 |

## Scope

**In scope** (the only files you should create/modify/delete):
- `.github/workflows/ci.yml` (create, at the **repo root**)
- `apps/web/.github/workflows/react-doctor.yml` (delete — dead file)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The Makefile, package.json scripts, or any app code — CI calls the existing gates; it does not redefine them.
- Re-adding react-doctor at the root — that is a conscious product decision for the maintainer (the action is third-party and was unpinned); record it in your report, don't do it.
- Branch protection / required checks — repo-settings, not files.
- `apps/web/package-lock.json` removal (hygiene backlog, separate change).

## Git workflow

- Repo rule (CLAUDE.md): **commit/push only when the operator asks.** Leave the new/deleted files staged-or-unstaged in the tree per operator instruction.
- If commits requested: branch `advisor/004-root-ci` off `main`; message `ci: run api and web verification gates on push/PR`; end with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Steps

### Step 1: Create `.github/workflows/ci.yml` at the repo root

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  api:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/api
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: seatlayout
          POSTGRES_PASSWORD: seatlayout
          POSTGRES_DB: seatlayout
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U seatlayout -d seatlayout"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgres://seatlayout:seatlayout@localhost:5432/seatlayout?sslmode=disable
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: apps/api/go.mod
          cache-dependency-path: apps/api/go.sum
      - name: Vet
        run: go vet ./...
      - name: Build
        run: go build ./...
      - name: Unit tests
        run: go test ./...
      - name: Migrate
        run: go run ./cmd/migrate
      - name: Integration tests
        run: go test -tags=integration ./...

  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: apps/web/pnpm-lock.yaml
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm typecheck
      - name: Lint
        run: pnpm lint
      - name: Tests
        run: pnpm test
      - name: Build
        run: pnpm build
```

**Verify**: the YAML sanity command from the table → `ok`.

### Step 2: Delete the dead workflow

Delete `apps/web/.github/workflows/react-doctor.yml`. If the parent directories (`apps/web/.github/workflows`, `apps/web/.github`) become empty, remove them too.

**Verify**: `git status --porcelain | grep react-doctor` → shows the deletion (` D apps/web/.github/workflows/react-doctor.yml`); `ls apps/web/.github 2>/dev/null` → no such directory (or empty).

### Step 3: Confirm local equivalence of every CI step

Run the two "local equivalence" commands from the table. They are exactly what CI will run (minus the DB service for integration tests — run `make db-up && make migrate && make api-test-integration` too if Docker is available, otherwise note that integration steps are validated only by the first CI run).

**Verify**: both command chains exit 0.

## Test plan

This plan adds no app tests; the deliverable *is* the test automation. Validation layers:
1. YAML parses (Step 1 verify).
2. Every command in the workflow proven to pass locally (Step 3).
3. Final proof is the first push/PR after the operator commits — the report should tell the operator: "the `CI` workflow will appear in the Actions tab on the next push; both jobs must be green."

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` exists at the repo root and parses as YAML
- [ ] `apps/web/.github/workflows/react-doctor.yml` is deleted
- [ ] Local equivalence commands exit 0 (API unit gates + web gates; integration gates if Docker available)
- [ ] `git status --porcelain` shows only: the new workflow, the deleted workflow, `plans/README.md` (plus the pre-existing uncommitted `apps/api` perf diff, untouched)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A root `.github/workflows/` already exists (drift check) — reconcile, don't overwrite.
- `pnpm test` fails locally on Node 24 with a TS/type-stripping error — the runner pin needs rethinking; report the exact error rather than switching the test script to a transpiler.
- `go run ./cmd/migrate` requires env vars beyond `DATABASE_URL` (read `apps/api/cmd/migrate/main.go` to confirm; at planning time it used only DATABASE_URL via config defaults).
- Any local gate fails for pre-existing reasons (e.g. the uncommitted perf diff breaks `go vet`) — report; do not "fix" app code under this plan.

## Maintenance notes

- When plan 006 (TS strict) lands, CI enforces it automatically via `pnpm typecheck` — no workflow change needed.
- The eslint gate currently passes with ~32 warnings; if the team wants a ratchet, add `--max-warnings 32` to the lint script later (not this plan).
- Integration tests run on every PR; if they become slow, split them to a separate job gated on paths (`apps/api/**`).
- If the maintainer wants react-doctor in CI, re-add it at the root, **pinned to a tag/SHA** (the deleted file used `millionco/react-doctor@main`).
- Reviewer scrutiny: the `go-version-file` pin (uses `go 1.25.3` from go.mod — setup-go resolves it), and that pnpm version (9) matches `pnpm-lock.yaml`'s `lockfileVersion: '9.0'`.
