# Tool Report QC - Hướng dẫn deploy

Tài liệu này mô tả cách vận hành và deploy `tool-report-qc` lên VPS `36.50.176.196`.

Trạng thái hiện tại:

- Production URL: `https://qc.apexdev.website`
- Health check public: `https://qc.apexdev.website/api/health`
- App source trên VPS: `/opt/tool-report-qc`
- Production `.env` trên VPS: `/opt/tool-report-qc/.env`
- Ảnh upload lưu trên VPS: `/srv/tool-report-qc/uploads`
- Reverse proxy: Traefik gateway hiện có trên VPS
- Docker Compose project: `tool-report-qc`
- Git branch triển khai hiện tại: `feature/vps-auto-deploy`

## 1. Kiến trúc production

Stack production chạy hoàn toàn trên VPS:

- `qc-api`: Node/Express API + serve frontend build
- `qc-postgres`: PostgreSQL 16, lưu dữ liệu QC
- `qc-rabbitmq`: RabbitMQ, xử lý hàng đợi chống quá tải
- `qc-worker`: worker xử lý photo job
- `qc-gemini-worker`: worker gọi Gemini server-side, có retry/backoff/circuit breaker
- Upload ảnh: bind mount từ VPS `/srv/tool-report-qc/uploads`

Public traffic đi qua Traefik:

```text
Internet
  -> https://qc.apexdev.website
  -> traefik_gateway
  -> http://tool-report-qc-app:3000
```

Không expose PostgreSQL/RabbitMQ ra Internet.

## 2. File quan trọng

Trong repo:

```text
Dockerfile
docker-compose.yml
.env.vps.example
.github/workflows/deploy.yml
DEPLOYMENT.md
docs/superpowers/plans/2026-08-02-vps-auto-deploy.md
```

Trên VPS:

```text
/opt/tool-report-qc
/opt/tool-report-qc/.env
/srv/tool-report-qc/uploads
/root/service/gateway/config/dynamic.yml
```

## 3. Deploy thủ công lên VPS

Dùng khi cần deploy ngay từ máy local, không chờ GitHub Actions.

### 3.1 Verify local trước khi deploy

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
npm test
npm run lint
npm run build
POSTGRES_PASSWORD=dummy \
QC_ADMIN_API_KEY=dummy \
RABBITMQ_PASSWORD=dummy \
GEMINI_API_KEY=dummy \
docker compose config >/tmp/tool-report-qc-compose.yml
```

Yêu cầu:

- Test pass.
- Typecheck/lint pass.
- Build pass.
- Docker Compose config hợp lệ.

### 3.2 Gói source từ commit hiện tại

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
archive_path=/tmp/tool-report-qc-$(git rev-parse --short HEAD).tgz
git archive --format=tar.gz -o "$archive_path" HEAD
```

### 3.3 Copy source lên VPS

```bash
scp "$archive_path" root@36.50.176.196:/tmp/tool-report-qc-source.tgz
```

### 3.4 Giải nén và chạy Docker Compose

```bash
ssh root@36.50.176.196 'set -euo pipefail
APP_DIR=/opt/tool-report-qc
test "$APP_DIR" = "/opt/tool-report-qc"
test -f "$APP_DIR/.env"
mkdir -p /srv/tool-report-qc/uploads
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
tar -xzf /tmp/tool-report-qc-source.tgz -C "$APP_DIR"
rm -f /tmp/tool-report-qc-source.tgz
cd "$APP_DIR"
docker compose -p tool-report-qc up -d --build
'
```

Lưu ý:

- Lệnh trên giữ lại `/opt/tool-report-qc/.env`.
- Không xoá Docker volumes của PostgreSQL/RabbitMQ.
- Không xoá `/srv/tool-report-qc/uploads`.

### 3.5 Verify sau deploy

```bash
ssh root@36.50.176.196 'set -e
cd /opt/tool-report-qc
docker compose -p tool-report-qc ps
curl --fail http://127.0.0.1:3020/api/health
docker compose -p tool-report-qc exec -T qc-rabbitmq rabbitmqctl list_queues name messages consumers
'
```

Public health:

```bash
curl --fail https://qc.apexdev.website/api/health
```

Kết quả mong đợi:

```json
{"status":"ok"}
```

Queue mong đợi:

```text
qc.photo-processing   0   1
qc.gemini-analysis    0   1
```

## 4. Auto deploy bằng GitHub Actions

Workflow: `.github/workflows/deploy.yml`

Trigger:

- Tự chạy khi có push vào branch `main`.
- Có thể chạy thủ công bằng `workflow_dispatch`.

Luồng deploy:

1. GitHub Actions checkout code.
2. Chạy verify:
   - `npm ci`
   - `npm test`
   - `npm run lint`
   - `npm run build`
   - `docker compose config`
3. Nếu verify pass, workflow đóng gói source của đúng commit `${GITHUB_SHA}`.
4. Copy archive qua SSH lên VPS.
5. VPS giữ nguyên `.env`, volumes, uploads.
6. VPS chạy:

```bash
docker compose -p tool-report-qc up -d --build
```

7. Workflow health check:

```bash
curl --fail http://127.0.0.1:3020/api/health
```

## 5. GitHub Secrets cần cấu hình

Vào GitHub repo:

```text
Settings -> Secrets and variables -> Actions -> Repository secrets
```

Tạo các secrets:

```text
VPS_HOST=36.50.176.196
VPS_USER=root
VPS_PORT=22
VPS_APP_DIR=/opt/tool-report-qc
VPS_SSH_KEY=<private deploy key>
VPS_KNOWN_HOSTS=<known_hosts cua VPS>
```

Local đã tạo sẵn deploy key tại:

```text
/Users/apexdev/Desktop/bot-Dung/.secrets/tool-report-qc/github-actions-vps-deploy-key
```

Nội dung file này dùng cho secret:

```text
VPS_SSH_KEY
```

Local đã tạo sẵn known hosts tại:

```text
/Users/apexdev/Desktop/bot-Dung/.secrets/tool-report-qc/vps_known_hosts
```

Nội dung file này dùng cho secret:

```text
VPS_KNOWN_HOSTS
```

Không commit thư mục `.secrets` vào Git.

## 6. One-time VPS setup

Các bước này đã được thực hiện trên VPS, chỉ cần làm lại nếu rebuild VPS mới.

### 6.1 Tạo thư mục

```bash
ssh root@36.50.176.196 'set -e
mkdir -p /opt/tool-report-qc
mkdir -p /srv/tool-report-qc/uploads
chmod 755 /opt/tool-report-qc
chmod 755 /srv/tool-report-qc
chmod 755 /srv/tool-report-qc/uploads
'
```

### 6.2 Tạo production env

File:

```text
/opt/tool-report-qc/.env
```

Mẫu:

```env
POSTGRES_DB=tool_report_qc
POSTGRES_USER=tool_report_qc
POSTGRES_PASSWORD=<strong-password>
QC_ADMIN_API_KEY=<strong-admin-key>
RABBITMQ_USER=tool_report_qc
RABBITMQ_PASSWORD=<strong-password>
WORKER_PREFETCH=2
GEMINI_API_KEY=<server-side-gemini-key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_RPM=10
GEMINI_CIRCUIT_COOLDOWN_MS=300000
PORT=3020
UPLOADS_DIR=/srv/tool-report-qc/uploads
```

Set quyền:

```bash
ssh root@36.50.176.196 'chmod 600 /opt/tool-report-qc/.env'
```

Không đưa `VITE_GEMINI_API_KEY` vào production.

## 7. Traefik route

Traefik config:

```text
/root/service/gateway/config/dynamic.yml
```

Route đã thêm:

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
  priority: 75
```

Service:

```yaml
tool-report-qc-service:
  loadBalancer:
    servers:
      - url: "http://tool-report-qc-app:3000"
    passHostHeader: true
```

Backup hiện có:

```text
/root/service/gateway/config/dynamic.yml.bak.20260802155721
```

Nếu cần kiểm tra:

```bash
ssh root@36.50.176.196 'grep -n "tool-report-qc" /root/service/gateway/config/dynamic.yml'
```

## 8. DNS

DNS cần trỏ:

```text
qc.apexdev.website -> 36.50.176.196
```

Kiểm tra:

```bash
dig +short qc.apexdev.website
```

Kết quả mong đợi:

```text
36.50.176.196
```

## 9. Lệnh vận hành thường dùng

Xem container:

```bash
ssh root@36.50.176.196 'cd /opt/tool-report-qc && docker compose -p tool-report-qc ps'
```

Xem log:

```bash
ssh root@36.50.176.196 'cd /opt/tool-report-qc && docker compose -p tool-report-qc logs --tail 150 qc-api qc-worker qc-gemini-worker'
```

Restart app:

```bash
ssh root@36.50.176.196 'cd /opt/tool-report-qc && docker compose -p tool-report-qc restart qc-api qc-worker qc-gemini-worker'
```

Xem queue:

```bash
ssh root@36.50.176.196 'cd /opt/tool-report-qc && docker compose -p tool-report-qc exec -T qc-rabbitmq rabbitmqctl list_queues name messages consumers'
```

Kiểm tra upload folder:

```bash
ssh root@36.50.176.196 'find /srv/tool-report-qc/uploads -maxdepth 2 -type f | head'
```

## 10. Rollback

Nếu deploy lỗi ngay sau khi lên code mới, rollback bằng commit cũ từ local:

```bash
cd /Users/apexdev/Desktop/bot-Dung/tool-report-qc
git checkout <previous-good-commit>
archive_path=/tmp/tool-report-qc-rollback.tgz
git archive --format=tar.gz -o "$archive_path" HEAD
scp "$archive_path" root@36.50.176.196:/tmp/tool-report-qc-source.tgz
ssh root@36.50.176.196 'set -euo pipefail
APP_DIR=/opt/tool-report-qc
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
tar -xzf /tmp/tool-report-qc-source.tgz -C "$APP_DIR"
rm -f /tmp/tool-report-qc-source.tgz
cd "$APP_DIR"
docker compose -p tool-report-qc up -d --build
curl --fail http://127.0.0.1:3020/api/health
'
```

Không rollback bằng cách xoá volume, trừ khi chủ động muốn mất dữ liệu.

## 11. Bảo mật

- Không commit `.env`.
- Không commit private deploy key.
- Không expose PostgreSQL/RabbitMQ public.
- `GEMINI_API_KEY` chỉ nằm server-side.
- Nếu key bị lộ trong log/chat/tool output, rotate key trong Google AI Studio rồi cập nhật `/opt/tool-report-qc/.env`.
- Sau khi đổi secret, restart services:

```bash
ssh root@36.50.176.196 'cd /opt/tool-report-qc && docker compose -p tool-report-qc up -d'
```

## 12. Checklist trước khi merge vào `main`

- [ ] GitHub Actions secrets đã tạo đủ.
- [ ] `npm test` pass.
- [ ] `npm run lint` pass.
- [ ] `npm run build` pass.
- [ ] `docker compose config` pass.
- [ ] `https://qc.apexdev.website/api/health` đang OK.
- [ ] Người phụ trách đã rotate `GEMINI_API_KEY` nếu cần.

Sau khi checklist pass, merge branch `feature/vps-auto-deploy` vào `main`. Từ đó, mỗi push vào `main` sẽ auto deploy lại VPS.
