# Agent Guide

Forest Bush is a feature flag platform MVP. Treat it as a monorepo with four
main areas:

- `api/`: Express 5 API, Prisma, PostgreSQL, Redis via `ioredis`, Zod
  validation, Fly.io deployment config.
- `admin-ui/`: React 18, Vite, TypeScript, Tailwind, lucide-react, Fly.io
  deployment config.
- `sdk-js/`: TypeScript JavaScript SDK that calls the public evaluation API.
- `infra/terraform/`: Terraform Cloud/Fly.io app and secret wiring. It does
  not provision Postgres or Redis.

## Current Product Shape

The implemented product supports creating, listing, updating, deleting, and
evaluating feature flags. Public evaluation is `GET /flags/:key`, optionally
with `?userId=...` for sticky percentage rollouts. Admin CRUD lives under
`/admin/flags` and is protected with an `x-api-key` header when
`ADMIN_API_KEY` is configured. Flags are stored in PostgreSQL using Prisma.
Rules are stored as JSON, currently shaped like:

```json
{ "rolloutPercentage": 25 }
```

Redis caches public evaluation results for 60 seconds.

## Important Known Issues

The API, admin UI, and docs use `rules.rolloutPercentage` as the canonical
rollout shape. Do not reintroduce a top-level `rolloutPercentage` field.

Percentage rollout requires `userId`. Anonymous percentage evaluations return
disabled with `reason: "context_required"` to avoid random cached behavior.

Redis cache keys are versioned with `flag-version:<key>`. Admin create, update,
and delete should increment that version so user-specific evaluations do not
stay stale after mutations.

If `ADMIN_API_KEY` is missing, admin routes are allowed with a warning. This is
acceptable for local prototyping only.

## Common Commands

Run commands from the relevant package directory.

API:

```bash
cd api
npm install
npx prisma migrate dev
npm run dev
```

Admin UI:

```bash
cd admin-ui
npm install
npm run dev
npm run build
```

SDK:

```bash
cd sdk-js
npm install
npm run build
```

Useful verification today: `api npm test`, `admin-ui npm run build`, and
`sdk-js npm run build`. API tests require `TEST_DATABASE_URL` and use in-memory
Redis.

## Environment

API local env lives in `api/.env`:

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
PORT=8080
ADMIN_API_KEY="..."
```

The admin UI calls `VITE_API_URL` when set, otherwise `http://localhost:8080`.

## Development Guidance

Prefer small, contract-first changes. When changing API response shapes, update
the admin UI and SDK together or add compatibility mapping. Avoid overstating
implemented capabilities in docs; multi-tenancy, RBAC, analytics, audit logs,
custom targeting, and published SDK packaging are not implemented yet.

For backend changes, keep validation in `api/src/schemas/flagSchemas.js` aligned
with Prisma and evaluation behavior in `api/src/index.js`. For admin changes,
keep `admin-ui/src/lib/api.ts` as the single API boundary. For SDK changes,
preserve safe default behavior: network or server failures should return the
caller-provided default value.

Do not commit secrets. Do not rely on Terraform to create Neon or Upstash
resources. Deployment currently exists for the API through GitHub Actions; the
admin UI has Fly config but no deploy workflow.

## Good Next Technical Steps

The strongest next improvements are: move the API to TypeScript with shared
schemas, add environments, add audit events, and evolve SDK evaluation toward
local snapshots or polling instead of one HTTP request per flag check.
