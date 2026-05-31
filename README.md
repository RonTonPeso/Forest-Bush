# Forest Bush

Forest Bush is a self-hosted feature flag service. The current repository is a
working MVP with a Node/Express API, PostgreSQL persistence through Prisma,
Redis-backed evaluation caching, a React admin dashboard, a small JavaScript SDK,
Fly.io deployment files, Terraform configuration, and a GitHub Actions deploy
workflow for the API.

The product is focused on a simple loop:

1. Create and manage flags from the admin dashboard or admin API.
2. Evaluate flags from client applications through the public API or JS SDK.
3. Use percentage rollout rules for sticky user-based releases.

## Current Capabilities

- Public flag evaluation at `GET /flags/:key`
- Admin CRUD endpoints under `/admin/flags`
- API-key protection for admin endpoints with the `x-api-key` header
- Boolean flag enable/disable state
- Percentage rollout rule support with stable hashing when `userId` is supplied
- Redis result caching for public flag evaluations
- PostgreSQL storage for flag metadata and JSON rules
- React/Vite admin UI for login, listing, creating, toggling, editing, and deleting flags
- TypeScript JS SDK with optional in-memory client-side caching
- Dockerfiles and Fly.io configuration for both API and admin UI
- Terraform Cloud configuration for the Fly.io API app and API secrets
- GitHub Actions workflow that deploys the API to Fly.io on pushes to `main`

## Not Yet Implemented

These are useful product directions, but they are not currently implemented in
this repository:

- Multi-tenant organizations or projects
- RBAC, user accounts, or OAuth login
- Audit logs and flag change history
- Experiment analytics, conversion tracking, or usage metrics
- Region, attribute, segment, or custom-rule targeting
- Server-sent events, streaming updates, or SDK polling
- Published npm package for the JS SDK
- Automated tests
- Admin UI deployment through the current GitHub Actions workflow

## Architecture

```text
Client app
  |
  |  JS SDK or direct HTTP request
  v
Forest Bush API on Fly.io
  |
  |-- Prisma -> PostgreSQL
  |
  `-- ioredis -> Redis evaluation cache

Admin user
  |
  v
React admin UI on Fly.io
  |
  `-- Admin API requests with x-api-key
```

## Repository Structure

```text
.
├── api/                  # Express API, Prisma schema, Dockerfile, Fly config
├── admin-ui/             # React + TypeScript + Vite admin dashboard
├── sdk-js/               # TypeScript JavaScript SDK
├── infra/terraform/      # Terraform Cloud/Fly.io app and secret configuration
├── .github/workflows/    # API deployment workflow
├── index.html            # Root HTML shell from the UI template
└── README.md
```

## API

The API is an Express 5 service using Prisma, PostgreSQL, ioredis, Zod, Helmet,
CORS, and Morgan.

### Environment

Create `api/.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
REDIS_URL="redis://default:password@host:6379"
PORT=8080
ADMIN_API_KEY="replace-with-a-strong-secret"
```

`ADMIN_API_KEY` protects admin routes. If it is missing, the current code allows
admin access and logs a warning, which is convenient for local experiments but
should not be used in production.

### Local Development

```bash
cd api
npm install
npx prisma migrate dev
npm run dev
```

The API listens on `http://localhost:8080` by default.

### Public Endpoints

```http
GET /health
```

Returns a simple process health response.

```http
GET /healthz
```

Checks PostgreSQL and Redis connectivity.

```http
GET /flags/:key
GET /flags/:key?userId=user-123
```

Evaluates a flag. If `userId` is supplied, percentage rollouts are sticky for
that user because evaluation hashes `flagKey:userId`.

Example response:

```json
{
  "key": "new-checkout-flow",
  "enabled": true,
  "reason": "rollout"
}
```

### Admin Endpoints

All admin requests require:

```http
x-api-key: your-admin-api-key
```

Create a flag:

```http
POST /admin/flags
Content-Type: application/json

{
  "key": "new-checkout-flow",
  "description": "Controls the new checkout experience",
  "enabled": true,
  "rules": {
    "rolloutPercentage": 25
  }
}
```

List flags:

```http
GET /admin/flags
```

Get one flag:

```http
GET /admin/flags/:key
```

Update a flag:

```http
PUT /admin/flags/:key
Content-Type: application/json

{
  "enabled": false,
  "rules": {
    "rolloutPercentage": 0
  }
}
```

Delete a flag:

```http
DELETE /admin/flags/:key
```

## Admin UI

The admin UI is a React 18, Vite, TypeScript, Tailwind, and lucide-react
application. It stores the admin API key in `localStorage`, verifies it by
calling `GET /admin/flags`, and then uses it for flag management requests.

### Local Development

```bash
cd admin-ui
npm install
npm run dev
```

By default the UI calls `http://localhost:8080`. To point it at another API:

```env
VITE_API_URL="https://forest-bush.fly.dev"
```

The Fly.io UI configuration builds with `VITE_API_URL=https://forest-bush.fly.dev`
and serves the built app with `serve` on port `3000`.

## JavaScript SDK

The SDK lives in `sdk-js/` and exports `ForestBushClient`.

```bash
cd sdk-js
npm install
npm run build
```

Example:

```ts
import { ForestBushClient } from '@forest-bush/sdk-js';

const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  cacheTTL: 30,
});

const enabled = await forestBush.evaluate(
  'new-checkout-flow',
  false,
  'user-123'
);
```

The SDK package metadata is prepared as `@forest-bush/sdk-js`, but the package
is not currently published to npm.

## Deployment

### API

The API has:

- `api/Dockerfile`
- `api/fly.toml` for the `forest-bush` Fly.io app
- `.github/workflows/fly-deploy.yml`, which deploys `api/` to Fly.io on pushes
  to `main`

Required Fly secrets:

```bash
flyctl secrets set DATABASE_URL="..." REDIS_URL="..." ADMIN_API_KEY="..." --app forest-bush
```

### Admin UI

The admin UI has:

- `admin-ui/Dockerfile`
- `admin-ui/fly.toml` for the `forest-bush-ui` Fly.io app

There is not currently a GitHub Actions workflow for deploying the admin UI.

### Terraform

`infra/terraform/` is configured for Terraform Cloud organization `Ronton` and
workspace `forest-bush`. It uses the Fly provider to create the API Fly app and
a `null_resource` local-exec step to set `DATABASE_URL` and `REDIS_URL` as Fly
secrets.

Terraform variables:

```hcl
fly_api_token = "..."
db_url        = "..."
redis_url     = "..."
```

Note that Terraform does not provision PostgreSQL or Redis. Those services are
expected to exist already, for example through Neon and Upstash.

## Known Issues

- The admin UI expects `rolloutPercentage` as a top-level flag property, but the
  API stores rollout data under `rules.rolloutPercentage`. The API evaluation
  logic supports rollout rules, but the UI display/edit flow needs to be aligned
  with the API response shape.
- Updating or deleting a flag only invalidates the anonymous Redis cache key.
  User-specific cached evaluations such as `flag:my-flag:user-123` may remain
  stale until their 60 second TTL expires.
- Redis is initialized at startup from `REDIS_URL`. Local development is easier
  if Redis is always available or the API explicitly supports a no-Redis mode.
- The API has no automated tests around evaluation behavior, admin validation,
  cache invalidation, or error handling.
- The admin UI stores the admin API key in `localStorage`, which is acceptable
  for a prototype but not ideal for a production control plane.

## Roadmap Ideas

- Fix the admin UI/API rule-shape mismatch.
- Add integration tests with test PostgreSQL and Redis containers.
- Add audit events for every flag change.
- Introduce projects/environments so flags can differ between development,
  staging, and production.
- Add targeting rules for user attributes and reusable segments.
- Add SDK polling, bootstrap values, and offline fallback behavior.
- Publish the SDK package and add examples for Node, React, and Next.js.
- Add an admin UI deployment workflow.
