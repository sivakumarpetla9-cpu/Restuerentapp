# AI Business Agent — Production Cloud Deployment Guide

This guide walks through deploying the **AI Business Agent** to a production cloud environment with public HTTPS, backed by **Neon PostgreSQL** and **Brevo Transactional Email**, strictly adhering to the **₹0 budget / local-first** architecture.

---

## 1. Production Architecture Overview

```text
                     ┌───────────────────────────────────┐
                     │     Public Dashboard & Client     │
                     │  React 19 / Vite SPA (HTTPS)      │
                     └─────────────────┬─────────────────┘
                                       │ Same-Origin / Secure Cookies
                                       ▼
                     ┌───────────────────────────────────┐
                     │     Production Node.js Server     │
                     │   server.js (HTTP / API Routes)   │
                     └─────────────────┬─────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
                ▼                      ▼                      ▼
      Neon PostgreSQL 18.6        Ollama / AI            Brevo Email
      (14 Relational Tables)     (Local/Private)     (Webhook & Dispatch)
```

### Architecture Highlights:
1. **Single-Service Full-Stack Deployment**: `server.js` serves both the backend REST API (`/api/*`) and the compiled production React SPA (`frontend/dist`) on the root path (`/`).
2. **Zero Cross-Origin Friction**: Because the frontend and backend share the exact same domain and port, session cookies (`SameSite=Lax; HttpOnly; Secure`) work out-of-the-box with zero CORS configuration required.
3. **Public Health Monitoring**: Dedicated unauthenticated `/health` and `/api/health` endpoints satisfy cloud platform uptime probes and zero-downtime rolling deploys.
4. **Resilient Persistence**: Powered by Neon serverless PostgreSQL with connection pooling, transactional integrity, and dual-mode fallback.
5. **₹0 Operating Cost**: Uses free-tier allocations across Neon (0.5 GB database), Brevo (300 emails/day), and Render/Railway free web services.

---

## 2. Infrastructure Cost Breakdown

| Component | Provider | Plan | Monthly Cost |
| :--- | :--- | :--- | :---: |
| **Relational Database** | [Neon PostgreSQL](https://neon.tech) | Serverless Free Tier (0.5 GB, SSL pooler) | **₹0** |
| **Web Service & Dashboard** | [Render](https://render.com) | Free Web Service (Node.js, HTTPS, Auto-Deploy) | **₹0** |
| **Transactional Email** | [Brevo](https://brevo.com) | Free Plan (300 emails/day, Inbound Webhooks) | **₹0** |
| **AI Inference** | Local / Private Ollama | Local machine or existing private endpoint | **₹0** |
| **Total Production Cost** | | | **₹0 / mo** |

---

## 3. Recommended Deployment: Render (1-Click Blueprint)

[Render](https://render.com) is the recommended host for deploying the AI Business Agent on a single service with free automated SSL certificates and continuous Git deployments.

### Step 1: Initialize Git Repository
If your local directory is not yet a git repository, initialize and commit your code:

```powershell
git init
git add .
git commit -m "feat: production cloud readiness release"
```

Push to your GitHub or GitLab private repository:
```powershell
git remote add origin https://github.com/<your-username>/ai-business-agent.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml`.
4. Fill in your environment secrets:
   * `DATABASE_URL`: Your Neon PostgreSQL pooler connection string:
     `postgresql://neondb_owner:***@ep-quiet-cherry-b4tdnms7-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
   * `ADMIN_EMAIL`: Initial admin login email (e.g., `admin@yourcompany.com`)
   * `ADMIN_PASSWORD`: Strong password for the administrator account
   * `BREVO_API_KEY`: Your Brevo transactional API key (from Brevo account settings)
   * `BREVO_SENDER_EMAIL`: Verified sender email in Brevo
   * `BREVO_SENDER_NAME`: Business name (e.g., `AI Business Agent`)
   * `BREVO_WEBHOOK_SECRET`: A secure random token for verifying incoming Brevo webhooks
5. Click **Apply**.

Render will run:
* **Build Command**: `npm run build` (installs frontend packages and builds `frontend/dist`)
* **Start Command**: `npm start` (`node server.js`)
* **Health Check**: `GET /health` (verifies service health before cutting over traffic)

---

## 4. Manual Cloud Deployment (Railway, Fly.io, or VPS)

If deploying to **Railway**, **Fly.io**, or an Ubuntu VPS:

### Build and Start Commands
* **Build Command**: `npm run build`
* **Start Command**: `npm start`
* **Health Check Path**: `/health`
* **Exposed Port**: Default `process.env.PORT` or `3001`

### Running on Ubuntu VPS with PM2
```bash
# Clone and build
git clone <repo-url> ai-business-agent
cd ai-business-agent
npm install
npm run build

# Run database migration (idempotent)
npm run db:migrate

# Start with PM2
npm install -g pm2
pm2 start server.js --name "ai-biz-agent" --env production
pm2 save
pm2 startup
```

---

## 5. Production Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Yes | `production` | Enables production optimizations, secure cookies, and strict security headers |
| `PORT` | Auto | `3001` | Cloud platforms inject this dynamically |
| `DATABASE_PROVIDER` | Yes | `postgres` | Persistence engine (`postgres` or `json`) |
| `DATABASE_URL` | Yes | - | Neon PostgreSQL connection URI with SSL mode |
| `SESSION_SECRET` | Yes | - | High-entropy string used for timing-safe cookie & token signing |
| `ADMIN_EMAIL` | Optional | - | Bootstraps initial administrator account if no users exist |
| `ADMIN_PASSWORD` | Optional | - | Password for bootstrapped admin account |
| `COMMUNICATION_PROVIDER` | Yes | `brevo` | Active gateway provider (`brevo` or `local`) |
| `EMAIL_PROVIDER` | Yes | `brevo` | Active email adapter |
| `BREVO_API_KEY` | If Brevo | - | Brevo v3 REST API key |
| `BREVO_SENDER_EMAIL` | If Brevo | - | Verified sender email in Brevo account |
| `BREVO_SENDER_NAME` | If Brevo | `AI Business Agent` | Name shown on outgoing emails |
| `BREVO_WEBHOOK_SECRET` | Optional | - | Webhook authentication secret for tracking delivery/opens/replies |
| `AI_PROVIDER` | Optional | `ollama` | Provider for AI completions (`ollama`) |
| `OLLAMA_HOST` | Optional | `127.0.0.1` | Hostname for Ollama server |
| `OLLAMA_PORT` | Optional | `11434` | Port for Ollama server |
| `OLLAMA_MODEL` | Optional | `qwen3:8b` | Model name |

---

## 6. Post-Deployment Verification Checklist

Once your deployment is live at `https://<your-app>.onrender.com`:

1. **Verify Health Endpoint**:
   ```bash
   curl -i https://<your-app>.onrender.com/health
   ```
   *Expected Response:* `HTTP 200 OK` with JSON `{ "status": "ok", "service": "ai-business-agent", ... }`

2. **Verify Public Dashboard**:
   * Navigate to `https://<your-app>.onrender.com/` in your browser.
   * Confirm the login screen loads and HTTPS certificate is valid.

3. **Log in as Administrator**:
   * Use your configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
   * Verify the dashboard overview displays metrics loaded from Neon PostgreSQL.

4. **Verify Database Health**:
   * Navigate to the **Database Status** section or call:
   ```bash
   curl -i https://<your-app>.onrender.com/api/database/status -H "Authorization: Bearer <token>"
   ```
   *Confirm `connected: true`, `isNeon: true`, and table counts match.*

5. **Configure Brevo Webhook URL**:
   * In Brevo Dashboard → **Settings** → **Webhooks** → **Add a new webhook**.
   * URL: `https://<your-app>.onrender.com/api/communication/webhook/brevo`
   * Select events: *Delivered*, *Opened*, *Clicked*, *Bounced*, *Soft bounce*, *Reply*.
   * Add secret header `X-Brevo-Webhook-Secret: <your-secret>`.
