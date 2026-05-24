# ColdReach Intel — common dev tasks.
# Run `make` (no args) to see this list.
.DEFAULT_GOAL := help

.PHONY: help install run dev build start test test-watch test-coverage lint lint-fix format format-check typecheck clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install npm dependencies (clean install)
	npm ci

run: dev ## Alias for `make dev`

dev: ## Start the Next.js dev server on http://localhost:3000
	npm run dev

build: ## Build the production bundle
	npm run build

start: ## Run the production bundle (requires `make build` first)
	npm run start

test: ## Run all tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with a coverage report
	npm run test:coverage

lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint and auto-fix what it can
	npm run lint:fix

format: ## Run Prettier --write across the repo
	npm run format

format-check: ## Verify formatting without modifying files
	npm run format:check

typecheck: ## Run `tsc --noEmit`
	npm run typecheck

clean: ## Remove build + coverage artifacts and caches
	rm -rf .next out coverage node_modules/.cache *.tsbuildinfo
