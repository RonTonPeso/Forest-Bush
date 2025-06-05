# Forest-Bush
bushy forest - feature flag and experimentation platform 

# 🌲 Forest Bush — Feature Flag Management & Delivery Platform

Forest Bush is a **cloud-native feature flag management platform** built for modern dev teams. It empowers developers and product managers to safely roll out features, run experiments, and decouple deployments from releases.

This project serves as an infrastructure capstone to demonstrate production-level capabilities across:

- Infrastructure as Code (Terraform)
- CI/CD pipelines
- Scalable backend architecture
- Observability and logging
- Secure and cost-effective cloud deployment
- Multi-environment support

---

## 📦 Key Features

- ✅ **Create and manage feature flags** via dashboard or API
- 🌍 **Roll out features by region, percentage, or custom rules**
- ⚡ **Ultra-low-latency flag delivery** using Redis caching
- 📊 **Flag usage logging and metrics**
- 🔒 **Secure, tenant-aware architecture** with RBAC
- ☁️ Deployed to Fly.io, with **Postgres via Neon** and **Redis via Upstash**

---

## 🏗️ System Architecture

```
          ┌───────────────────┐
          │   Client Apps     │
          └────────┬──────────┘
                   │
        HTTPS REST API (Fly.io)
                   │
         ┌────────▼────────┐
         │   Backend API   │ ◀────────────┐
         │ (Node.js + ORM) │              │
         └────────┬────────┘              │
                  │                       │
       ┌──────────▼──────────┐    ┌───────▼────────┐
       │ Neon Postgres (flags│    │ Redis Cache    │
       │  + rules metadata)  │    │ (Upstash)      │
       └─────────────────────┘    └────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/)
- [Terraform CLI](https://developer.hashicorp.com/terraform/downloads)
- [Docker](https://www.docker.com/)
- `curl` or Postman for testing

### Local Development (API)

1.  **Navigate to the API directory:**
    ```bash
    cd api
    ```

2.  **Set up environment variables:**
    Create a `.env` file in the `api/` directory (`api/.env`) with the following content, replacing placeholders with your actual credentials:
    ```env
    # Neon Postgres connection string (obtain from your Neon dashboard)
    DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

    # Upstash Redis connection string (obtain from your Upstash dashboard)
    REDIS_URL="redis://default:password@host:port"

    # Port for the API server to listen on
    PORT=8080
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Run database migrations:**
    This will apply the schema and generate the Prisma client.
    ```bash
    npx prisma migrate dev
    ```
    *Note: If you encounter issues, ensure your `DATABASE_URL` in `.env` is correct and your Neon database is accessible.*

5.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The API should now be running locally, typically at `http://localhost:8080`.

6.  **(Optional) Seed initial data:**
    For testing endpoints like `/flags/:key`, you might want to manually add some feature flags to your Neon database.

### Terraform Setup (Infrastructure)

The infrastructure for this project (Fly.io app, Neon Postgres, Upstash Redis) is managed by Terraform. The configuration is located in the `infra/terraform/` directory.

1.  **Prerequisites:**
    *   Ensure you have Terraform CLI installed.
    *   You have set up a Terraform Cloud account and organization.
    *   A Terraform Cloud workspace (e.g., "forest-bush") is created and configured to use the version control workflow, pointing to your repository and the `infra/terraform` directory.
    *   The following environment variables are configured as **sensitive** variables in your Terraform Cloud workspace:
        *   `FLY_API_TOKEN`: Your Fly.io API token.
        *   `TF_VAR_db_url`: Your Neon Postgres connection string. (Terraform will use this to inform the Fly app, but doesn't provision the DB itself).
        *   `TF_VAR_redis_url`: Your Upstash Redis connection string. (Terraform will use this to inform the Fly app, but doesn't provision Redis itself).

2.  **Initialize Terraform:**
    Navigate to the Terraform directory and initialize Terraform. This is usually handled by Terraform Cloud, but for local planning/testing:
    ```bash
    cd infra/terraform
    terraform init
    ```

3.  **Plan and Apply:**
    Terraform Cloud will automatically plan and apply changes on commits to the `main` branch (if configured for auto-apply). For manual local application (ensure your backend is configured correctly or use local state for testing):
    ```bash
    terraform plan
    terraform apply
    ```

---

## �� Project Structure

```bash
forest-bush/
│
├── infra/               # Infrastructure-as-code (Terraform)
│   ├── main.tf          # DigitalOcean, Fly.io, Neon, Upstash resources
│   └── ...
│
├── api/                 # Backend API
│   ├── prisma/          # Prisma schema and migrations
│   ├── src/
│   │   ├── routes/
│   │   └── index.js
│   ├── .env             # Environment variables (for local dev only) - DO NOT COMMIT
│   └── Dockerfile       # Fly.io deployment config
│
├── web/                 # Frontend UI (optional future phase)
│   └── ...
│
├── .github/             # GitHub Actions CI/CD
│
└── README.md            # This file
```

---

## 🧪 API Usage

The API is deployed and accessible.

**Live Demo Endpoints:**
-   Application Root: [https://forest-bush.fly.dev/](https://forest-bush.fly.dev/)
-   Health Check: [https://forest-bush.fly.dev/health](https://forest-bush.fly.dev/health)
-   Health Check (with DB/Redis): [https://forest-bush.fly.dev/healthz](https://forest-bush.fly.dev/healthz)

**Key Endpoints:**
```http
GET /health
```
Check if the API is running

```http
GET /flags/:key
```
Retrieve a flag's state and rule info

```http
POST /flags
```
Create a new flag (admin-only)

> Want full API documentation? Check the `/api/docs` once the Swagger/OpenAPI spec is implemented in Phase 3.

---

## 🌍 Environments & Configuration

Environment variables:

```env
DATABASE_URL=...        # Neon Postgres DB
REDIS_URL=...           # Upstash Redis instance
PORT=8080
```

---

## 🧱 Infrastructure Stack

| Layer | Tool |
|-------|------|
| IaC | Terraform |
| Cloud | Fly.io (App), Neon (Postgres), Upstash (Redis) |
| CI/CD | GitHub Actions |
| Monitoring | Logs via Fly.io + Prometheus/Grafana (planned) |
| Deployment | Docker + Fly.io |
| Secrets | Terraform Cloud Environment Variables |

---

## 🔐 Security Considerations

- Secrets are stored in **Terraform Cloud** and **Fly.io secrets**
- Redis access is **token-based**
- Postgres uses **SSL enforced connections**
- Future plans: RBAC, JWT authentication, audit logs

---

## 🧪 CI/CD Pipeline (Phase 3)

- `infra/` triggers Terraform Cloud via GitHub push
- `api/` deploys to Fly.io via GitHub Actions on PR merge
- `web/` (future): Netlify or Vercel deployment

---

## 📈 Observability & Monitoring

Currently:
- Live logs via `fly logs`

Planned:
- Prometheus metrics
- Grafana dashboards
- Alerts via email or Slack

---

## 🧠 Why This Project?

Forest Bush is not just a clone of LaunchDarkly. It's:

- A modular platform you can iterate on: experimentation, SDKs, frontend UI, more flag types
- **Free-tier** friendly, with cloud-agnostic design

---

## 🚧 Roadmap

- [x] Phase 0 - Infrastructure Setup
- [x] Phase 1 - App Provisioning
- [x] Phase 2 - Backend API MVP
- [ ] Phase 3 - Flag Logic + Admin Features
- [ ] Phase 4 - Frontend Dashboard
- [ ] Phase 5 - CI/CD, Observability, Docs

---

## 🙋‍♂️ Author

Created by rontonpeso as an infrastructure engineering capstone project to showcase:
- System design
- Cost-effective deployment
- Observability, security, and CI/CD automation

---
