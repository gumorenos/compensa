# Compensa

Compensa is a modular compensation-management product. The current Stage 1 focuses on **auditable job evaluation**: versioned job descriptions, deterministic scoring, evidence, review/approval and organization-scoped access control.


## Current capabilities

- deterministic, versioned scoring engine with calculation trace;
- configurable factors, dimensions, levels and grades;
- PostgreSQL persistence and tenant-consistent foreign keys;
- immutable job-description versions pinned to valuations;
- justification and structured evidence per valuation decision;
- DRAFT → IN_REVIEW → RETURNED / APPROVED workflow;
- Better Auth sessions with organization memberships;
- `ADMIN`, `EVALUATOR` and `REVIEWER` permissions;
- actor-aware audit trail;
- Next.js manual web application;
- Docker/Compose staging package and database-aware healthcheck.

AI is intentionally **not** part of Stage 1. When added, it will propose evidence/levels while the deterministic engine remains the sole scoring authority.

## Requirements

- Node.js 22+
- PostgreSQL 18.x for integration/runtime
- Docker + Docker Compose v2 for the staging workflow

## Development

Install dependencies:

```bash
npm install
```

Required runtime variables:

```bash
export DATABASE_URL='postgres://...'
export BETTER_AUTH_SECRET='at-least-32-random-characters'
export BETTER_AUTH_URL='http://localhost:3000'
```

Run migrations and the app:

```bash
npm run db:migrate
npm run dev
```

Create the first administrator only when provisioning a fresh environment:

```bash
export COMPENSA_ADMIN_EMAIL='admin@example.com'
export COMPENSA_ADMIN_PASSWORD='strong-password-at-least-12-chars'
npm run bootstrap:admin
```

## Quality gates

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
```

GitHub Actions also validates the staging Compose file, builds the final standalone image and runs a hardened container smoke test.

## Staging

Use the committed template and runbook:

- `.env.staging.example`
- `compose.staging.yml`
- [`docs/STAGING_DEPLOYMENT.md`](docs/STAGING_DEPLOYMENT.md)
- [`docs/QA_PENDING.md`](docs/QA_PENDING.md)

Do not commit real `.env` files, database dumps or production/staging secrets.

## Design documentation

- [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md)
- [`docs/VALUATION_V1_FUNCTIONAL_DESIGN.md`](docs/VALUATION_V1_FUNCTIONAL_DESIGN.md)
- [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md)
- [`docs/DESCRIPTIONS_REVIEW_WORKFLOW.md`](docs/DESCRIPTIONS_REVIEW_WORKFLOW.md)
- [`docs/AUTH_RBAC.md`](docs/AUTH_RBAC.md)

## Architecture principle

```text
human / future AI interpretation
            |
            v
    validated selections
            |
            v
 deterministic domain engine
            |
            v
 points + grade + calculation trace
```

The web UI does not calculate compensation scores independently. It persists decisions and delegates scoring to the domain engine so there is one auditable source of truth.
