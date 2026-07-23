# Convenience wrapper around the npm scripts / docker / terraform commands documented
# in README.md and terraform/README.md. The npm scripts are the cross-platform
# primary; this is optional sugar for anyone who prefers `make`. On Windows, use the
# npm scripts directly (or run this via Git Bash / WSL).

.PHONY: help install dev build test lint typecheck seed \
        docker-up docker-down docker-build \
        tf-init tf-plan tf-apply tf-fmt tf-validate

help:
	@echo "Targets:"
	@echo "  install       Install backend + dashboard + mock-service dependencies"
	@echo "  dev           Run the gateway in watch mode (npm run dev)"
	@echo "  build         Build the gateway (tsc)"
	@echo "  test          Run the backend test suite"
	@echo "  lint          Lint the backend"
	@echo "  typecheck     Typecheck the backend"
	@echo "  seed          Generate local JWT keys + .env (scripts/dev-seed.sh)"
	@echo "  docker-up     docker compose up --build (full local stack)"
	@echo "  docker-down   docker compose down"
	@echo "  docker-build  Build the production gateway image"
	@echo "  tf-init       terraform init (terraform/)"
	@echo "  tf-plan       terraform plan -var-file=environments/dev.tfvars"
	@echo "  tf-apply      terraform apply -var-file=environments/dev.tfvars"
	@echo "  tf-fmt        terraform fmt -recursive"
	@echo "  tf-validate   terraform validate"

install:
	npm ci
	cd dashboard && npm ci
	cd mock-service && npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

seed:
	npm run seed

docker-up:
	npm run docker:up

docker-down:
	npm run docker:down

docker-build:
	docker build -t secure-api-gateway:local -f Dockerfile .

tf-init:
	terraform -chdir=terraform init

tf-plan:
	npm run tf:plan

tf-apply:
	npm run tf:apply

tf-fmt:
	terraform -chdir=terraform fmt -recursive

tf-validate:
	terraform -chdir=terraform validate
