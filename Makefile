# Seat-Layout monorepo — common dev tasks
# Usage: `make <target>`. See `make help`.

SHELL := /bin/bash
API_DIR := apps/api
WEB_DIR := apps/web

# Load DATABASE_URL etc. from .env if present (for migrate/api-dev).
ifneq (,$(wildcard .env))
include .env
export
endif

DATABASE_URL ?= postgres://seatlayout:seatlayout@localhost:5432/seatlayout?sslmode=disable
export DATABASE_URL

GO ?= go

.PHONY: help db-up db-down migrate api-dev api-build api-test api-test-integration vet web-dev web-install fmt

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

db-up: ## Start local Postgres (docker-compose) and wait until healthy
	docker compose up -d db
	@echo "Waiting for Postgres to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' seatlayout_db 2>/dev/null)" = "healthy" ]; do sleep 1; done
	@echo "Postgres is ready at $(DATABASE_URL)"

db-down: ## Stop local Postgres
	docker compose down

migrate: ## Apply database migrations
	cd $(API_DIR) && $(GO) run ./cmd/migrate

api-dev: ## Run the API server (go run)
	cd $(API_DIR) && $(GO) run ./cmd/server

api-build: ## Build the API server binary into apps/api/bin/server
	cd $(API_DIR) && $(GO) build -o bin/server ./cmd/server

api-test: ## Run API unit tests
	cd $(API_DIR) && $(GO) test ./...

api-test-integration: ## Run API integration tests (needs db-up)
	cd $(API_DIR) && $(GO) test -tags=integration ./...

vet: ## Run go vet on the API
	cd $(API_DIR) && $(GO) vet ./...

fmt: ## Format Go code
	cd $(API_DIR) && $(GO) fmt ./...

web-install: ## Install web dependencies
	cd $(WEB_DIR) && pnpm install

web-dev: ## Run the Next.js web dev server
	cd $(WEB_DIR) && pnpm dev
