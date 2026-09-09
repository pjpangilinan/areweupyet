<p align="center">
  <img src="logo.png" alt="AreWeUpYet" width="200">
</p>

<h1 align="center">AreWeUpYet</h1>

<p align="center">
  <strong>Multi-tenant synthetic uptime monitoring with public status pages, incident tracking, and HMAC-signed webhook alerting.</strong>
</p>

<p align="center">
  <a href="https://main.d3pikhz9umtg2m.amplifyapp.com/"><img src="https://img.shields.io/badge/Production-Live-00C853?style=flat&logo=amazonaws" alt="Live Demo"></a>
  <a href="https://main.d3pikhz9umtg2m.amplifyapp.com/#/status/c97a151c-d091-7089-88a9-7a8eee8689b8"><img src="https://img.shields.io/badge/Public%20Status%20Page-View%20Live-2563EB?style=flat&logo=statuspage" alt="Live Status Page"></a>
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
</p>

---

## Overview

AreWeUpYet is a multi-tenant uptime monitoring SaaS. It checks HTTP(S) endpoints on a configurable cadence, renders public view-only status pages, records latency trends, detects outages using consecutive-failure thresholds, and dispatches HMAC-signed webhook notifications.

### Key Features

- **Synthetic Probing Engine**: Go-based ping engine with SSRF defense (blocking private, loopback, link-local, and cloud metadata IPs at DNS resolution and socket connection time).
- **Public View-Only Status Pages**: Shareable status dashboards with 30-second live polling, overall system health, and individual endpoint inspection.
- **Latency & Incident Tracking**: Tracks 24h/7d/30d uptime percentages, response latency curves, and the latest 5 synthetic checks.
- **HMAC-SHA256 Webhooks**: Outbound incident notifications (`incident.opened`, `incident.resolved`) signed with per-tenant secrets and exponential backoff retry.
- **Multi-Tenant Scoping**: Cognito User Pool authentication with strict tenant isolation on all private routes.

---

## Interface

| Fleet Dashboard | Public Status Page |
|:---:|:---:|
| <img src="docs/screenshots/05-dashboard-monitors.png" width="100%" alt="Fleet Dashboard" /> | <img src="docs/screenshots/08-status-page.png" width="100%" alt="Public Status Page" /> |
| *Operational overview, monitor fleet, and group filtering* | *View-only status page ([Live Link](https://main.d3pikhz9umtg2m.amplifyapp.com/#/status/c97a151c-d091-7089-88a9-7a8eee8689b8))* |

| Latency & Probe Inspector | Alerts & Webhooks |
|:---:|:---:|
| <img src="docs/screenshots/06-endpoint-detail.png" width="100%" alt="Probe Inspector" /> | <img src="docs/screenshots/07-settings.png" width="100%" alt="Webhook Settings" /> |
| *Response time trends, uptime %, and latest 5 probes* | *HMAC signing secret and outbound webhook dispatch* |

---

## Architecture

```text
GitHub Push ──► AWS Amplify Gen 2 (CI/CD)
                     ├─ Frontend: React SPA (Vite + Tailwind CSS on CloudFront)
                     └─ Backend: CDK Definition (amplify/backend.ts)
                          ├─ Cognito User Pool: Authentication & tenant JWT tokens
                          ├─ DynamoDB: Endpoints, PingResults (90d TTL), Incidents
                          └─ Go Lambda Functions (provided.al2023, x86_64):
                               ├─ Dispatcher   ── EventBridge rate(1m) ──► Scans due checks & pings
                               ├─ ApiPrivate   ── Function URL (Cognito) ──► Fleet CRUD & manual checks
                               ├─ ApiPublic    ── Function URL (Public)  ──► Status page & history
                               └─ Notifier     ── Event worker          ──► HMAC-signed webhooks
```

---

## Security & Reliability

1. **SSRF Guard (`internal/ssrfguard`)**: Rejects `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (AWS IMDS), and loopback IPv6 (`::1`). Verifies IP addresses at socket dial time to prevent DNS rebinding.
2. **Tenant Identity Enforcement**: Production API derives `tenantId` strictly from verified Cognito JWT `sub` claims, preventing tenant impersonation.
3. **Rate Limiting**:
   - Manual check probes: 30-second cooldown per endpoint, 5-second cooldown per tenant.
   - Webhook testing: Max 2 dispatches per 10 seconds per tenant.
   - Public status API: 60 requests/minute per client IP.
4. **Dispatcher Concurrency Control**: Conditional DynamoDB updates ensure overlapping Lambda ticks do not double-check the same endpoint.

---

## Quickstart

### Prerequisites

- Go >= 1.22
- Node.js >= 20
- npm >= 10

### 1. Local Development

```bash
# Clone repository
git clone https://github.com/pjpangilinan/areweupyet.git
cd areweupyet

# Install dependencies
npm ci
cd frontend && npm ci && cd ..

# Start local backend (port 8080)
npm run dev:backend

# In a separate terminal, start frontend (port 5173)
npm run dev:frontend
```

### 2. Run Tests

```bash
# Run backend Go tests
npm run test:go

# Run frontend build & typecheck
npm run build:frontend
```

### 3. Standalone CLI Pinger

Run the zero-dependency CLI pinger directly against any URL:

```bash
go build -o pinger ./cmd/pinger
./pinger https://example.com
```

---

## API Reference

### Private API (`ApiPrivateFunction` · Cognito Bearer Auth)

| Method | Route | Description | Rate Limit |
|:---|:---|:---|:---:|
| `GET` | `/endpoints` | List tenant monitors | Standard |
| `POST` | `/endpoints` | Create new monitor (max 20 per tenant) | Standard |
| `GET` | `/endpoints/{id}` | Get monitor details | Standard |
| `PUT` | `/endpoints/{id}` | Update URL, name, cadence, timeout | Standard |
| `DELETE` | `/endpoints/{id}` | Delete monitor, ping history, incidents | Standard |
| `POST` | `/endpoints/{id}/check` | Trigger immediate synthetic check | 30s endpoint / 5s tenant |
| `POST` | `/settings/webhook/test` | Dispatch test webhook | 2 per 10s |

### Public API (`ApiPublicFunction` · Unauthenticated Read)

| Method | Route | Description | Rate Limit |
|:---|:---|:---|:---:|
| `GET` | `/status/{tenantId}` | Public status summary & monitored fleet | 60 req/min per IP |
| `GET` | `/status/{tenantId}/endpoints/{id}/history` | Availability metrics, incident timeline, latest 5 pings | 60 req/min per IP |

### Webhook Specification

Outbound webhooks are sent via POST with `Content-Type: application/json` and signed with an HMAC-SHA256 signature in the `X-AreWeUpYet-Signature` header:

```json
{
  "event": "incident.opened",
  "tenantId": "c97a151c-d091-7089-88a9-7a8eee8689b8",
  "endpointId": "7a59d40e9d167914",
  "endpointUrl": "https://d1cdomhzh1pe4j.cloudfront.net",
  "incidentId": "inc-4a2f8b1c",
  "startedAt": "2026-09-09T15:14:11Z",
  "resolvedAt": null,
  "durationSeconds": 0
}
```

```http
X-AreWeUpYet-Signature: sha256=d2c67f8a9e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d
```

---

## License

MIT
