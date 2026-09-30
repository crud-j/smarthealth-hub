# SmartHealth Hub — Developer Makefile
# Run `make help` to see all available targets.

.PHONY: setup start stop restart logs test test-cov test-frontend test-all migrate migrate-new lint lint-fix generate-api validate-secrets clean help

BACKEND_DIR := backend
FRONTEND_DIR := frontend/web

## setup: Run the full developer bootstrap (first-time setup)
setup:
	@sh scripts/bootstrap.sh

## start: Start all Docker services
start:
	docker compose up -d

## stop: Stop all Docker services (without removing volumes)
stop:
	docker compose stop

## restart: Restart all Docker services
restart:
	docker compose restart

## logs: Tail logs from all services
logs:
	docker compose logs -f

## test: Run the backend test suite with coverage enforcement
test:
	cd $(BACKEND_DIR) && pytest --cov=app --cov-fail-under=70 --tb=short

## test-frontend: Run the frontend Vitest test suite
test-frontend:
	cd $(FRONTEND_DIR) && npm run test

## test-all: Run backend and frontend test suites
test-all:
	$(MAKE) test && $(MAKE) test-frontend

## test-cov: Run backend tests with full coverage report
test-cov:
	cd $(BACKEND_DIR) && pytest --cov=app --cov-report=term-missing --cov-fail-under=70 --tb=short

## migrate: Run pending Alembic migrations
migrate:
	docker compose run --rm backend alembic upgrade head

## migrate-new: Create a new Alembic migration (usage: make migrate-new MSG="your message")
migrate-new:
	docker compose run --rm backend alembic revision --autogenerate -m "$(MSG)"

## lint: Lint backend (ruff) and frontend (eslint)
lint:
	ruff check $(BACKEND_DIR)/app
	cd $(FRONTEND_DIR) && npm run lint

## lint-fix: Auto-fix lint issues where possible
lint-fix:
	ruff check --fix $(BACKEND_DIR)/app
	ruff format $(BACKEND_DIR)/app

## generate-api: Regenerate TypeScript API types from OpenAPI spec (backend must be running)
generate-api:
	cd $(FRONTEND_DIR) && npm run generate:api

## validate-secrets: Validate required environment secrets (requires backend/.env)
validate-secrets:
	cd $(BACKEND_DIR) && python scripts/validate_secrets.py

## clean: Stop and remove all containers AND volumes (destructive — will prompt)
clean:
	@printf "This will delete all containers and volumes including the database. Continue? [y/N] " && \
	read CONFIRM && [ "$$CONFIRM" = "y" ] || [ "$$CONFIRM" = "Y" ] && \
	docker compose down -v && echo "Cleaned." || echo "Aborted."

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## /  /' | column -t -s ':'
