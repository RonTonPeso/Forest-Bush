# Forest Bush

**A self-hosted feature flag platform.** Status: complete and deployed.

Forest Bush lets a team turn features on and off in production without
redeploying, roll a feature out to a percentage of users, and see exactly who
got what and why. It is the kind of tool LaunchDarkly sells, designed and built
from scratch as a self-hosted product.

> This is a portfolio project. Its purpose is to demonstrate end-to-end
> engineering: API design, data modeling, caching, a real frontend, a published
> SDK, infrastructure as code, and CI/CD, all working together as one product.

**Live:** Dashboard https://forest-bush-ui.fly.dev · API https://forest-bush.fly.dev

---

## What it does

- Create, edit, and toggle feature flags from a web dashboard or a REST API.
- Roll a feature out to a percentage of users, where the same user always gets a
  consistent answer (sticky rollouts).
- Keep flag state separate across development, staging, and production.
- Record a full audit trail of every change.
- Evaluate flags from an application through a published JavaScript SDK,
  including an offline-capable local mode.
- Explain any evaluation: why a given user did or did not get a feature.

## What it demonstrates

| Area | Highlights |
|------|------------|
| **Backend** | REST API in Node / Express 5, request validation with Zod, PostgreSQL via Prisma with migrations, transactional writes for flag changes plus their audit records. |
| **Caching** | Redis evaluation cache with versioned keys, so a flag change invalidates instantly instead of waiting out a TTL, and degrades gracefully when Redis is absent. |
| **Frontend** | React + TypeScript + Vite + Tailwind dashboard: environment switching, inline rule editing, audit history, and a live evaluation tester. |
| **SDK / library design** | TypeScript SDK published to npm, with remote and local-first evaluation, background polling, offline fallback, and decision traces. |
| **Infrastructure** | Dockerized API and UI deployed on Fly.io, provisioned and secret-wired through Terraform (Terraform Cloud). |
| **CI/CD** | GitHub Actions runs the test suite against a real Postgres service container, deploys both apps on merge to `main`, and publishes the SDK to npm on release tags. |
| **Testing** | Integration tests covering evaluation logic, admin mutations, environment isolation, cache invalidation, and traces. |

## Engineering highlights

A few decisions that go beyond plain CRUD:

- **Local-first SDK.** Applications can pull a versioned snapshot of every flag
  and evaluate locally, so a flag check is not a network round trip. If the API
  is unreachable, the SDK keeps serving the last good snapshot; a bootstrap
  snapshot lets it work from the very first call.
- **Correct cache invalidation.** Evaluations are cached under per-flag and
  per-environment version counters, so a change invalidates immediately without
  scanning or guessing at Redis keys.
- **Explainable evaluations.** Any result can return a structured trace (which
  rule applied, the user's rollout bucket, the threshold), surfaced in the
  dashboard so a developer can answer "why did this user get this?"
- **One contract, three consumers.** The API, dashboard, and SDK share a single
  evaluation model, and the percentage-rollout hashing is implemented
  identically on server and client so local and remote results always agree.

## Architecture

```text
        Client app                         Admin / developer
            |                                      |
   JS SDK or HTTP request                          v
            |                              React admin dashboard (Fly.io)
            v                                      |
   Forest Bush API (Fly.io)  <----- x-api-key -----+
            |
            |-- Prisma  --> PostgreSQL   (flags, rules, audit log)
            `-- ioredis --> Redis        (evaluation + snapshot cache)
```

## Tech stack

- **API:** Node.js, Express 5, Prisma, PostgreSQL, Redis (ioredis), Zod, Helmet
- **Dashboard:** React 18, TypeScript, Vite, Tailwind CSS
- **SDK:** TypeScript, published to npm as `@forest-bush/sdk-js`
- **Infrastructure:** Docker, Fly.io, Terraform (Terraform Cloud)
- **CI/CD:** GitHub Actions
- **Testing:** Vitest, Supertest

## Project status

Complete. The platform was built in three phases, all delivered:

1. **Stabilize:** correct rollout contracts, integration tests, resilient caching.
2. **Core product:** environments, audit history, the flag detail workflow, deploy automation, a published SDK.
3. **Distinctive features:** the local-first SDK (snapshots, polling, offline fallback, bootstrap) and end-to-end evaluation traces.

Deliberately out of scope, to stay a focused platform rather than a shallow
enterprise clone: multi-tenant organizations and billing, full RBAC / SSO,
experiment analytics, a custom targeting DSL, and a broad multi-language SDK
matrix. Snapshot signing and user-attribute targeting are noted as optional
future extensions.

**Trade-off worth naming:** the dashboard stores the admin API key in
`localStorage`. That is appropriate for a single-admin, self-hosted tool; a
multi-user production control plane would use a session-based auth flow instead.

---

The sections below are reference material for running, exploring, and deploying
the project locally.

<details>
<summary><strong>Repository structure</strong></summary>

```text
.
├── api/                  # Express API, Prisma schema, Dockerfile, Fly config
├── admin-ui/             # React + TypeScript + Vite admin dashboard
├── sdk-js/               # TypeScript SDK and usage examples
├── infra/terraform/      # Terraform Cloud / Fly.io app and secret configuration
└── .github/workflows/    # Fly.io deploy and SDK npm publish workflows
```

</details>

<details>
<summary><strong>Running locally</strong></summary>

**API** (listens on `http://localhost:8080`):

```bash
cd api
npm install
npx prisma migrate dev
npm run dev
```

Create `api/.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
REDIS_URL="redis://default:password@host:6379"
PORT=8080
ADMIN_API_KEY="replace-with-a-strong-secret"
```

`ADMIN_API_KEY` protects the admin routes. Redis is optional locally; the API
degrades gracefully without it.

**Dashboard** (calls `http://localhost:8080` by default, override with
`VITE_API_URL`):

```bash
cd admin-ui
npm install
npm run dev
```

**SDK:**

```bash
cd sdk-js
npm install
npm run build
```

</details>

<details>
<summary><strong>API reference</strong></summary>

### Public endpoints

```http
GET /health      # process health
GET /healthz     # checks PostgreSQL and Redis connectivity
```

```http
GET /flags/:key
GET /flags/:key?userId=user-123
GET /flags/:key?environment=staging&userId=user-123
GET /flags/:key?userId=user-123&explain=true
```

Evaluates a flag. If `userId` is supplied, percentage rollouts are sticky for
that user (evaluation hashes `flagKey:userId`). `environment` defaults to
`production`. Percentage rollouts require `userId`; anonymous percentage
evaluations return disabled with `reason: "context_required"`.

`reason` is one of `flag_not_found`, `disabled`, `enabled_no_rules`,
`context_required`, `rollout_match`, or `rollout_miss`.

```json
{ "key": "new-checkout-flow", "enabled": true, "reason": "rollout_match" }
```

Add `?explain=true` to include a `trace` explaining the decision (used by the
dashboard test panel; it bypasses the cache, so omit it for high-volume checks):

```json
{
  "key": "new-checkout-flow",
  "enabled": true,
  "reason": "rollout_match",
  "trace": {
    "environment": "production",
    "flagFound": true,
    "flagEnabled": true,
    "rule": "rolloutPercentage",
    "rolloutPercentage": 25,
    "userId": "user-123",
    "bucket": 17
  }
}
```

```http
GET /environments/:envKey/snapshot
```

Returns a versioned snapshot of every flag in an environment so SDKs can
evaluate locally. The `checksum` (and the `version` prefix derived from it) is
content based and stable until a flag in the environment changes.

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

### Admin endpoints

All admin requests require an `x-api-key: <ADMIN_API_KEY>` header. Every create,
update, toggle, and delete records an audit event.

```http
POST   /admin/flags                          # create
GET    /admin/flags?environment=staging      # list
GET    /admin/flags/:key?environment=staging # read one
GET    /admin/flags/:key/audit               # recent audit events
PUT    /admin/flags/:key                     # update / toggle
DELETE /admin/flags/:key                     # delete
```

Example create body:

```json
{
  "key": "new-checkout-flow",
  "environment": "production",
  "description": "Controls the new checkout experience",
  "enabled": true,
  "rules": { "rolloutPercentage": 25 }
}
```

</details>

<details>
<summary><strong>JavaScript SDK</strong></summary>

Published to npm as `@forest-bush/sdk-js`. New versions are released by
publishing a GitHub Release tagged `sdk-v*`, which triggers
`.github/workflows/publish-sdk.yml`. Node, React, and Next.js examples live in
`sdk-js/examples/`.

**Remote mode** (one request per check, with optional in-memory caching):

```ts
import { ForestBushClient } from '@forest-bush/sdk-js';

const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  environment: 'production',
  cacheTTL: 30,
});

const enabled = await forestBush.evaluate('new-checkout-flow', false, 'user-123');
```

**Local mode** (polls a snapshot in the background, evaluates locally, keeps
serving the last good snapshot if a refresh fails):

```ts
const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  mode: 'local',
  pollIntervalSeconds: 30,
});

await forestBush.start();
const enabled = await forestBush.evaluate('new-checkout-flow', false, 'user-123');
forestBush.stop();
```

In local mode, `evaluateWithTrace(key, default, userId)` returns
`{ enabled, reason, trace }` explaining the decision, and a `bootstrap` snapshot
can be passed in config so the client evaluates immediately, before any network
request.

</details>

<details>
<summary><strong>Deployment</strong></summary>

Both apps deploy to Fly.io via GitHub Actions on push to `main`.

- **API:** `api/Dockerfile`, `api/fly.toml` (app `forest-bush`). Required secrets:
  ```bash
  flyctl secrets set DATABASE_URL="..." REDIS_URL="..." ADMIN_API_KEY="..." --app forest-bush
  ```
- **Dashboard:** `admin-ui/Dockerfile`, `admin-ui/fly.toml` (app `forest-bush-ui`).
- **Terraform** (`infra/terraform/`): creates the API Fly app and sets its
  secrets through the Fly provider. It does not provision PostgreSQL or Redis;
  those are expected to exist already (for example Neon and Upstash).

</details>

<details>
<summary><strong>Tests</strong></summary>

API integration tests require a separate PostgreSQL database:

```bash
cd api
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/forest_bush_test" npm test
```

The suite runs Prisma migrations against `TEST_DATABASE_URL`, clears rows
between tests, and uses an in-memory Redis adapter.

</details>
