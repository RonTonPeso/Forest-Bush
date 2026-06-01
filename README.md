# Forest Bush

Forest Bush is a self-hosted feature flag service. The current repository is a
working MVP with a Node/Express API, PostgreSQL persistence through Prisma,
Redis-backed evaluation caching, a React admin dashboard, a small JavaScript SDK,
Fly.io deployment files, Terraform configuration, and a GitHub Actions deploy
workflow for the API and admin UI.

The product is focused on a simple loop:

1. Create and manage flags from the admin dashboard or admin API.
2. Evaluate flags from client applications through the public API or JS SDK.
3. Use percentage rollout rules for sticky user-based releases.

## Current Capabilities

- Public flag evaluation at `GET /flags/:key`
- Admin CRUD endpoints under `/admin/flags`
- API-key protection for admin endpoints with the `x-api-key` header
- Boolean flag enable/disable state
- Development, staging, and production flag environments
- Percentage rollout rule support with stable hashing when `userId` is supplied
- Audit history for every flag create, update, toggle, and delete, readable via
  `GET /admin/flags/:key/audit`
- Versioned environment snapshots at `GET /environments/:envKey/snapshot` for
  local-first SDK evaluation
- Redis result caching for public flag evaluations and snapshots
- PostgreSQL storage for flag metadata and JSON rules
- React/Vite admin UI for login, listing, creating, toggling, editing, and
  deleting flags, plus a flag detail page with rule editing, test evaluation,
  and audit history
- TypeScript JS SDK (published to npm) with optional in-memory caching and an
  opt-in local snapshot mode with background polling and offline fallback
- Dockerfiles and Fly.io configuration for both API and admin UI
- Terraform Cloud configuration for the Fly.io API app and API secrets
- GitHub Actions workflows that deploy the API and admin UI to Fly.io on pushes
  to `main`, and publish the SDK to npm on `sdk-v*` releases

## Product Direction

Forest Bush is not trying to become a broad LaunchDarkly clone. The near-term
goal is a complete, self-hosted feature flag platform for small teams: safe
rollouts, clear admin workflows, trustworthy evaluation behavior, useful SDKs,
and enough operational visibility to understand flag changes.

The original depth-over-breadth goals are now in place: audit history for every
flag change, a flag detail page with rule editing and test evaluation, and an
SDK that can evaluate locally from polled snapshots instead of one API request
per flag check. The remaining direction is explainability and targeting:

- Evaluation traces that explain why a user received a flag value
- Bootstrap values and signed snapshots for stricter local/offline use
- Simple user-attribute targeting and reusable segments

## Intentional Non-Goals For Now

These features are valuable, but they are intentionally deferred so the project
can feel complete instead of broad and shallow:

- SaaS-style multi-tenant organizations and billing
- Full RBAC, user invitations, SSO, or OAuth login
- Experiment analytics, conversion tracking, and statistical reporting
- Complex custom targeting languages
- Region-based targeting
- A large SDK matrix across many programming languages
- Enterprise compliance features

If the core flag platform becomes reliable and polished, the most likely future
expansion paths are advanced targeting or lightweight experimentation. Those
should come after audit logs, flag detail workflows, and SDK behavior are solid.

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
├── sdk-js/               # TypeScript JavaScript SDK and usage examples
├── infra/terraform/      # Terraform Cloud/Fly.io app and secret configuration
├── .github/workflows/    # Fly.io deploy and SDK npm publish workflows
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
GET /flags/:key?environment=staging&userId=user-123
```

Evaluates a flag. If `userId` is supplied, percentage rollouts are sticky for
that user because evaluation hashes `flagKey:userId`. `environment` defaults to
`production`; supported values are `development`, `staging`, and `production`.
Percentage rollout rules require `userId`; anonymous percentage evaluations
return disabled with `reason: "context_required"`.

Example response:

```json
{
  "key": "new-checkout-flow",
  "enabled": true,
  "reason": "rollout"
}
```

```http
GET /environments/:envKey/snapshot
```

Returns a versioned snapshot of every flag in an environment so SDKs can
evaluate locally instead of making one request per flag check. `envKey` must be
`development`, `staging`, or `production`. The `checksum` (and the `version`
prefix derived from it) is content based and stable until a flag in the
environment changes; `generatedAt` is informational.

```json
{
  "environment": "production",
  "version": "9f2a1c4e0b7d",
  "generatedAt": "2026-06-01T00:00:00.000Z",
  "checksum": "9f2a1c4e0b7d...",
  "flags": [
    { "key": "new-checkout-flow", "enabled": true, "rules": { "rolloutPercentage": 25 } }
  ]
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
  "environment": "production",
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
GET /admin/flags?environment=staging
```

Get one flag:

```http
GET /admin/flags/:key
GET /admin/flags/:key?environment=staging
```

Get recent audit events for one flag:

```http
GET /admin/flags/:key/audit
GET /admin/flags/:key/audit?environment=staging
```

Update a flag:

```http
PUT /admin/flags/:key
PUT /admin/flags/:key?environment=staging
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
DELETE /admin/flags/:key?environment=staging
```

## Admin UI

The admin UI is a React 18, Vite, TypeScript, Tailwind, and lucide-react
application. It stores the admin API key in `localStorage`, verifies it by
calling `GET /admin/flags`, and then uses it for flag management requests. The
dashboard supports environment-specific flag lists and a flag detail view with
rollout editing, test evaluation, and recent audit history.

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
  environment: 'production',
  cacheTTL: 30,
});

const enabled = await forestBush.evaluate(
  'new-checkout-flow',
  false,
  'user-123'
);
```

By default the client evaluates remotely, one request per check. Set
`mode: 'local'` to poll an environment snapshot in the background and evaluate
flags locally with no per-check request. Local evaluation uses the same rollout
hashing as the API, keeps serving the last good snapshot if a refresh fails, and
returns the caller's default until the first snapshot loads:

```ts
const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  environment: 'production',
  mode: 'local',
  pollIntervalSeconds: 30,
});

await forestBush.start();
const enabled = await forestBush.evaluate('new-checkout-flow', false, 'user-123');
forestBush.stop();
```

The SDK is published to npm as `@forest-bush/sdk-js`. New versions are released
by publishing a GitHub Release tagged `sdk-v*`, which triggers
`.github/workflows/publish-sdk.yml`. Node (remote and local), React, and Next.js
examples live under `sdk-js/examples/`.

## Deployment

### API

The API has:

- `api/Dockerfile`
- `api/fly.toml` for the `forest-bush` Fly.io app
- `.github/workflows/fly-deploy.yml`, which deploys `api/` and `admin-ui/` to
  Fly.io on pushes to `main`

Required Fly secrets:

```bash
flyctl secrets set DATABASE_URL="..." REDIS_URL="..." ADMIN_API_KEY="..." --app forest-bush
```

### Admin UI

The admin UI has:

- `admin-ui/Dockerfile`
- `admin-ui/fly.toml` for the `forest-bush-ui` Fly.io app

The shared GitHub Actions workflow deploys the admin UI to the `forest-bush-ui`
Fly.io app after checks pass.

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

## Tests

API integration tests require a separate PostgreSQL database. Set
`TEST_DATABASE_URL` before running tests:

```bash
cd api
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/forest_bush_test" npm test
```

The test suite runs Prisma migrations against `TEST_DATABASE_URL`, clears
feature-flag rows between tests, and uses an in-memory Redis adapter.

## Known Issues

- The admin UI stores the admin API key in `localStorage`, which is acceptable
  for a prototype but not ideal for a production control plane.

## Roadmap

### Phase 1: Stabilize

- [x] Fix the admin UI/API rule-shape mismatch.
- [x] Add integration tests with test PostgreSQL and in-memory Redis.
- [x] Improve Redis cache invalidation with versioned cache keys.
- [x] Make local development resilient when Redis is unavailable.
- [x] Keep API, admin UI, and SDK contracts aligned.

### Phase 2: Complete The Core Product

- [x] Add environments so flags can differ between development, staging, and
  production.
- [x] Add audit events for every flag create, update, toggle, and delete.
- [x] Add a flag detail page with editable rules, recent history, and test
  evaluation for a sample `userId`.
- [x] Add an admin UI deployment workflow.
- [x] Add examples for Node, React, and Next.js.
- [x] Publish the SDK package (`@forest-bush/sdk-js` on npm; releases via the
  `sdk-v*` tag workflow).

### Phase 3: Make It Distinctive

- [x] Add versioned environment snapshots for fast local evaluation.
- [x] Add SDK polling and offline fallback behavior.
- Add bootstrap values and signed snapshots for stricter local/offline use.
- Add evaluation traces that explain why a user received a flag value.
- Add simple user-attribute targeting and reusable segments only after the core
  experience is stable.
