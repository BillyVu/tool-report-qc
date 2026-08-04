# VPS Auto Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `tool-report-qc` to VPS `36.50.176.196` with PostgreSQL, RabbitMQ, image storage on VPS, and automatic redeploy on every commit merged to `main`.

**Architecture:** The application runs as a standalone Docker Compose project under `/opt/tool-report-qc`. PostgreSQL, RabbitMQ, API/frontend, photo worker, and Gemini worker run on the VPS; uploads are persisted under `/srv/tool-report-qc/uploads`. Public HTTPS traffic should be routed through the existing Traefik file-provider gateway on Docker network `traefik_public`; do not bind app HTTP directly to public `80`/`443`.

**Tech Stack:** React/Vite, Node/Express, PostgreSQL 16, RabbitMQ 3, Docker Compose, GitHub Actions, Traefik v3 file provider, VPS Ubuntu 22.04.

## Global Constraints

- Do not build or deploy on the VPS until the user explicitly asks to deploy.
- Do not print or commit secrets, especially `GEMINI_API_KEY`, database passwords, RabbitMQ passwords, or `ADMIN_API_KEY`.
- Preserve existing VPS workloads: `traefik_gateway`, `s-finance-ai`, `postiz`, `trading-ai`, `bot_service`, and related containers.
- Public ports `80` and `443` are already owned by `traefik_gateway`; app routing must use Traefik.
- Existing Traefik Docker provider is disabled; routes are managed by `/root/service/gateway/config/dynamic.yml`.
- VPS app directory target: `/opt/tool-report-qc`.
- VPS upload directory target: `/srv/tool-report-qc/uploads`.
- GitHub deploy branch: `main`.
- Current implementation branch: `feature/vps-auto-deploy`.
- Current local commit containing deployment automation: `283b675 feat: add VPS docker deployment automation`.

---

## Current VPS Findings

- SSH access works as `root@36.50.176.196`.
- Hostname: `vps-service-window`.
- Docker installed: `Docker version 29.5.0`.
- Legacy docker-compose installed: `docker-compose version 1.29.2`; Docker Compose plugin is also expected because existing containers report Compose `5.1.3`.
- Git installed: `git version 2.34.1`.
- Firewall via `ufw` is inactive.
- Disk: `/dev/vda1` has `79G` total, `31G` available, `60%` used.
- Memory: `7.8Gi` total, about `3.5Gi` available, no swap.
- `traefik_gateway` owns public `0.0.0.0:80` and `0.0.0.0:443`.
- Docker network for public routing: `traefik_public`.
- Missing before first deploy:
  - `/opt/tool-report-qc`
  - `/opt/tool-report-qc/.env`
  - `/srv/tool-report-qc/uploads`

## Files / Systems Affected

- Modify on VPS: `/opt/tool-report-qc`
  - Holds cloned Git repository.
  - Holds production `.env`.
  - Runs `docker compose up -d --build`.
- Modify on VPS: `/srv/tool-report-qc/uploads`
  - Durable local photo upload storage.
- Modify on VPS: `/root/service/gateway/config/dynamic.yml`
  - Adds Traefik router/service for the app host.
  - Must be backed up before editing.
- Modify in GitHub repository settings:
  - Add GitHub Actions secrets for SSH and deployment.
- Existing repo files already prepared:
  - `.github/workflows/deploy.yml`
  - `Dockerfile`
  - `docker-compose.yml`
  - `.env.vps.example`
  - `DEPLOYMENT.md`

## Proposed Production URL

Use a dedicated subdomain to avoid path-prefix issues in the React SPA:

```text
qc.apexdev.website
```

Required DNS:

```text
Type: A
Name: qc
Value: 36.50.176.196
Proxy/CDN: DNS-only unless the user explicitly wants Cloudflare proxying
```

## Task 1: Final Local Verification Before Any VPS Change

**Files:**
- Read: `/Users/apexdev/Desktop/bot-Dung/tool-report-qc/.github/workflows/deploy.yml`
- Read: `/Users/apexdev/Desktop/bot-Dung/tool-report-qc/docker-compose.yml`
- Read: `/Users/apexdev/Desktop/bot-Dung/tool-report-qc/.env.vps.example`

**Interfaces:**
- Consumes: local branch `feature/vps-auto-deploy`.
- Produces: verified source commit ready for push/merge.

- [ ] **Step 1: Confirm clean branch**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
git status --short --branch
git log --oneline -3
```

Expected:

```text
## feature/vps-auto-deploy...origin/feature/vps-auto-deploy
283b675 feat: add VPS docker deployment automation
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
npm test
```

Expected:

```text
Test Files  10 passed
Tests       20 passed
```

- [ ] **Step 3: Run lint**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
npm run lint
```

Expected:

```text
No lint errors.
```

- [ ] **Step 4: Build locally**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
npm run build
```

Expected:

```text
✓ built
```

- [ ] **Step 5: Validate Compose syntax locally**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
POSTGRES_PASSWORD=dummy \
RABBITMQ_PASSWORD=dummy \
ADMIN_API_KEY=dummy \
GEMINI_API_KEY=dummy \
docker compose config >/tmp/tool-report-qc-compose.yml
```

Expected: command exits with code `0`.

## Task 2: Prepare GitHub Actions Secrets

**Files / Settings:**
- Modify: GitHub repo secrets for `BillyVu/tool-report-qc`.
- Read: local SSH public/private deploy key source selected by the user.

**Interfaces:**
- Consumes: existing `.github/workflows/deploy.yml`.
- Produces: GitHub Actions can SSH to VPS and run deploy commands.

- [ ] **Step 1: Generate or select deploy SSH key**

If no dedicated deploy key exists, generate one locally:

```bash
ssh-keygen -t ed25519 -C "tool-report-qc-github-actions" -f /tmp/tool-report-qc-deploy-key -N ""
```

Expected files:

```text
/tmp/tool-report-qc-deploy-key
/tmp/tool-report-qc-deploy-key.pub
```

- [ ] **Step 2: Install public key on VPS**

```bash
ssh-copy-id -i /tmp/tool-report-qc-deploy-key.pub root@36.50.176.196
```

Expected: GitHub Actions private key can authenticate as `root`.

- [ ] **Step 3: Capture known_hosts**

```bash
ssh-keyscan -p 22 36.50.176.196
```

Expected: one or more host key lines for `36.50.176.196`.

- [ ] **Step 4: Add GitHub Actions secrets**

Set these exact repository secrets:

```text
VPS_SSH_KEY=<private key content from /tmp/tool-report-qc-deploy-key>
VPS_KNOWN_HOSTS=<output from ssh-keyscan -p 22 36.50.176.196>
VPS_HOST=36.50.176.196
VPS_USER=root
VPS_PORT=22
VPS_APP_DIR=/opt/tool-report-qc
```

Expected: GitHub Actions deploy job has all required SSH variables.

## Task 3: One-Time VPS Directory and Repository Setup

**Files:**
- Create: `/opt/tool-report-qc`
- Create: `/srv/tool-report-qc/uploads`
- Create: `/opt/tool-report-qc/.env`

**Interfaces:**
- Consumes: repo `git@github.com:BillyVu/tool-report-qc.git`.
- Produces: VPS has app source and persistent upload storage.

- [ ] **Step 1: Create app and upload directories**

```bash
ssh root@36.50.176.196 'set -e
mkdir -p /opt/tool-report-qc
mkdir -p /srv/tool-report-qc/uploads
chmod 755 /opt/tool-report-qc
chmod 755 /srv/tool-report-qc
chmod 755 /srv/tool-report-qc/uploads
'
```

Expected:

```text
/opt/tool-report-qc exists
/srv/tool-report-qc/uploads exists
```

- [ ] **Step 2: Clone repo into `/opt/tool-report-qc`**

```bash
ssh root@36.50.176.196 'set -e
if [ ! -d /opt/tool-report-qc/.git ]; then
  git clone git@github.com:BillyVu/tool-report-qc.git /opt/tool-report-qc
fi
cd /opt/tool-report-qc
git fetch origin main
git checkout main
git reset --hard origin/main
'
```

Expected:

```text
/opt/tool-report-qc/.git exists
branch is main
```

- [ ] **Step 3: Create production `.env`**

Create `/opt/tool-report-qc/.env` from `.env.vps.example` with real secret values:

```text
NODE_ENV=production
PORT=3020
DATABASE_URL=postgres://tool_report_qc:<strong-postgres-password>@postgres:5432/tool_report_qc
POSTGRES_DB=tool_report_qc
POSTGRES_USER=tool_report_qc
POSTGRES_PASSWORD=<strong-postgres-password>
RABBITMQ_URL=amqp://tool_report_qc:<strong-rabbitmq-password>@rabbitmq:5672/tool_report_qc
RABBITMQ_DEFAULT_USER=tool_report_qc
RABBITMQ_DEFAULT_PASS=<strong-rabbitmq-password>
RABBITMQ_DEFAULT_VHOST=tool_report_qc
UPLOAD_DIR=/app/uploads
ADMIN_API_KEY=<strong-admin-api-key>
GEMINI_API_KEY=<real-gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_REQUESTS_PER_MINUTE=10
GEMINI_MAX_ATTEMPTS=6
GEMINI_BACKOFF_MS=30000
PHOTO_WORKER_CONCURRENCY=2
GEMINI_WORKER_CONCURRENCY=1
```

Expected:

```bash
ssh root@36.50.176.196 'test -f /opt/tool-report-qc/.env && echo ENV_EXISTS'
```

prints:

```text
ENV_EXISTS
```

## Task 4: Add Traefik Route for `qc.apexdev.website`

**Files:**
- Modify: `/root/service/gateway/config/dynamic.yml`

**Interfaces:**
- Consumes: Docker service `tool-report-qc-app` attached to `traefik_public`.
- Produces: HTTPS route from `qc.apexdev.website` to `http://tool-report-qc-app:3020`.

- [ ] **Step 1: Backup Traefik dynamic config**

```bash
ssh root@36.50.176.196 'set -e
cp /root/service/gateway/config/dynamic.yml /root/service/gateway/config/dynamic.yml.bak.$(date +%Y%m%d%H%M%S)
'
```

Expected: backup file exists in `/root/service/gateway/config/`.

- [ ] **Step 2: Add router under `http.routers`**

Add this router block:

```yaml
    tool-report-qc-router:
      rule: "Host(`qc.apexdev.website`)"
      entryPoints:
        - websecure
      service: tool-report-qc-service
      middlewares:
        - block-scanners
        - secure-headers
      tls:
        certResolver: letsencrypt
      priority: 70
```

- [ ] **Step 3: Add service under `http.services`**

Add this service block:

```yaml
    tool-report-qc-service:
      loadBalancer:
        servers:
          - url: "http://tool-report-qc-app:3020"
        passHostHeader: true
```

- [ ] **Step 4: Validate Traefik reload**

```bash
ssh root@36.50.176.196 'set -e
docker logs --tail 100 traefik_gateway | tail -100
'
```

Expected: no new Traefik parse error after editing `dynamic.yml`.

## Task 5: First Manual VPS Deploy

**Files:**
- Read: `/opt/tool-report-qc/docker-compose.yml`
- Read: `/opt/tool-report-qc/.env`

**Interfaces:**
- Consumes: prepared VPS repo and env.
- Produces: running production containers and initialized database.

- [ ] **Step 1: Run Docker Compose build and start**

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
docker compose up -d --build
'
```

Expected containers:

```text
tool-report-qc-app
tool-report-qc-worker
tool-report-qc-gemini-worker
tool-report-qc-postgres
tool-report-qc-rabbitmq
```

- [ ] **Step 2: Confirm container state**

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
docker compose ps
'
```

Expected: app, workers, postgres, and rabbitmq are `Up`.

- [ ] **Step 3: Check internal health**

```bash
ssh root@36.50.176.196 'set -e
curl --fail http://127.0.0.1:3020/api/health
'
```

Expected JSON:

```json
{"ok":true}
```

- [ ] **Step 4: Check public route**

```bash
curl --fail https://qc.apexdev.website/api/health
```

Expected JSON:

```json
{"ok":true}
```

## Task 6: Enable Auto Deploy on Every Commit to `main`

**Files:**
- Modify only through Git merge/push:
  - `/Users/apexdev/Desktop/bot-Dung/tool-report-qc/.github/workflows/deploy.yml`
  - `/Users/apexdev/Desktop/bot-Dung/tool-report-qc/Dockerfile`
  - `/Users/apexdev/Desktop/bot-Dung/tool-report-qc/docker-compose.yml`

**Interfaces:**
- Consumes: branch `feature/vps-auto-deploy`.
- Produces: every push to `main` triggers GitHub Actions verify then deploy.

- [ ] **Step 1: Push branch if needed**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
git push -u origin feature/vps-auto-deploy
```

Expected: remote branch exists.

- [ ] **Step 2: Merge into `main` only after VPS one-time setup succeeds**

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
git checkout main
git pull --ff-only origin main
git merge --no-ff feature/vps-auto-deploy
git push origin main
```

Expected: push to `main` starts `.github/workflows/deploy.yml`.

- [ ] **Step 3: Watch workflow**

```bash
gh run list --repo BillyVu/tool-report-qc --limit 5
gh run watch --repo BillyVu/tool-report-qc
```

Expected:

```text
verify passes
deploy passes
```

## Task 7: Post-Deploy Smoke Test

**Files / Systems:**
- Test: production URL `https://qc.apexdev.website`
- Test: uploads persisted at `/srv/tool-report-qc/uploads`
- Test: queues do not accumulate unexpectedly.

**Interfaces:**
- Consumes: deployed production system.
- Produces: deploy acceptance signal.

- [ ] **Step 1: API health**

```bash
curl --fail https://qc.apexdev.website/api/health
```

Expected:

```json
{"ok":true}
```

- [ ] **Step 2: Container logs**

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
docker compose logs --tail 150 app worker gemini-worker
'
```

Expected: no repeated crash, database error, RabbitMQ auth error, or Gemini quota tight-loop.

- [ ] **Step 3: Queue depth**

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
docker compose exec -T rabbitmq rabbitmqctl list_queues -p tool_report_qc name messages consumers
'
```

Expected:

```text
photo_processing 0 1
gemini_analysis 0 1
```

- [ ] **Step 4: Upload persistence**

```bash
ssh root@36.50.176.196 'set -e
test -d /srv/tool-report-qc/uploads
find /srv/tool-report-qc/uploads -maxdepth 2 -type f | head
'
```

Expected: directory exists; uploaded files appear after tester flow creates images.

## Rollback Plan

- [ ] **Rollback code to previous commit**

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
git log --oneline -5
git reset --hard <previous-good-commit>
docker compose up -d --build
curl --fail http://127.0.0.1:3020/api/health
'
```

- [ ] **Disable public route without deleting app data**

Restore the latest backup:

```bash
ssh root@36.50.176.196 'set -e
ls -1t /root/service/gateway/config/dynamic.yml.bak.* | head -1
cp "$(ls -1t /root/service/gateway/config/dynamic.yml.bak.* | head -1)" /root/service/gateway/config/dynamic.yml
'
```

- [ ] **Stop app containers without deleting volumes**

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
docker compose stop
'
```

## Acceptance Criteria

- Local branch passes tests, lint, build, and Docker Compose config validation.
- VPS has app source in `/opt/tool-report-qc`.
- VPS stores uploaded images under `/srv/tool-report-qc/uploads`.
- PostgreSQL and RabbitMQ run locally on the VPS via Docker Compose.
- Gemini jobs retry with configured backoff and do not tight-loop when quota is exceeded.
- `https://qc.apexdev.website/api/health` returns `{"ok":true}`.
- Push to `main` triggers GitHub Actions verify and deploy jobs.
- Existing containers and existing Traefik routes remain running.

## Self-Review

- Spec coverage: VPS-local PostgreSQL, VPS-local image storage, RabbitMQ overload protection, Gemini quota handling, GitHub Actions auto deploy, and no premature VPS build are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: infrastructure names are consistent across tasks: `/opt/tool-report-qc`, `/srv/tool-report-qc/uploads`, `traefik_public`, `tool-report-qc-app`, and `qc.apexdev.website`.
