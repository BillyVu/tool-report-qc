# Tool Report QC Deployment

Trạng thái hiện tại: chuẩn bị cho môi trường tester/local trước. Chỉ build và chạy trên VPS khi có yêu cầu triển khai rõ ràng.

## Local Tester

Chạy API ở cổng `3020`, Vite ở cổng frontend đang dùng. Vite proxy `/api` sang `http://127.0.0.1:3020`.

```bash
cp .env.example .env
npm install
npm run migrate
PORT=3020 npm run start:api
npm run dev
```

Biến `VITE_QC_ADMIN_API_KEY` chỉ dùng để verify local nội bộ. Không dùng key này trong frontend public production.

## VPS Nội Bộ

Stack VPS dùng PostgreSQL và RabbitMQ local qua Docker Compose. Ảnh lưu tại `/srv/tool-report-qc/uploads` trên VPS, không dùng object storage bên ngoài. PostgreSQL và RabbitMQ không expose ra Internet.

```bash
cp .env.vps.example .env
mkdir -p /srv/tool-report-qc/uploads
docker compose up -d --build
curl http://127.0.0.1:3020/api/health
```

API bind `127.0.0.1:3020`, cần reverse proxy HTTPS trước khi public.

## Auto Deploy bằng GitHub Actions

Workflow `.github/workflows/deploy.yml` tự chạy khi có push vào branch `main`.

Luồng deploy:

1. GitHub Actions chạy `npm ci`, `npm test`, `npm run lint`, `npm run build`, `docker compose config`.
2. Nếu verify pass, workflow SSH vào VPS.
3. GitHub Actions đóng gói source của đúng commit `${GITHUB_SHA}` và copy archive qua SSH.
4. VPS giữ nguyên `.env`, PostgreSQL volume, RabbitMQ volume và `/srv/tool-report-qc/uploads`.
5. VPS giải nén source vào `/opt/tool-report-qc` và chạy `docker compose -p tool-report-qc up -d --build`.
6. Health check `http://127.0.0.1:3020/api/health`.

Repository secrets cần tạo trong GitHub:

```text
VPS_HOST=36.50.176.196
VPS_USER=root
VPS_PORT=22
VPS_APP_DIR=/opt/tool-report-qc
VPS_SSH_KEY=<private deploy key>
VPS_KNOWN_HOSTS=<output cua ssh-keyscan>
```

Tạo deploy key:

```bash
ssh-keygen -t ed25519 -f /Users/apexdev/Desktop/bot-Dung/.secrets/tool-report-qc/github-actions-vps-deploy-key -C "tool-report-qc-github-actions"
ssh-copy-id -i /Users/apexdev/Desktop/bot-Dung/.secrets/tool-report-qc/github-actions-vps-deploy-key.pub root@36.50.176.196
ssh-keyscan -p 22 36.50.176.196 > /Users/apexdev/Desktop/bot-Dung/.secrets/tool-report-qc/vps_known_hosts
```

Trên VPS, chuẩn bị thư mục app một lần:

```bash
mkdir -p /opt/tool-report-qc /srv/tool-report-qc/uploads
# tao /opt/tool-report-qc/.env tu .env.vps.example
# dien POSTGRES_PASSWORD, QC_ADMIN_API_KEY, RABBITMQ_PASSWORD, GEMINI_API_KEY
```

Sau khi setup xong, mỗi commit được push lên `main` sẽ tự deploy lại. Không lưu `.env` production trong GitHub.

## Gemini

Gemini chỉ chạy server-side trong `qc-gemini-worker`. Không cấu hình `VITE_GEMINI_API_KEY`.

Cơ chế chống lỗi quota:

- job Gemini vào RabbitMQ, không gọi trực tiếp từ browser;
- retry exponential backoff kèm jitter;
- circuit breaker sau nhiều lỗi quota liên tiếp;
- cache theo hash ảnh, model và detect type;
- kết quả/lỗi lưu trong PostgreSQL để tester không mất dữ liệu.

## Verification

Trước khi triển khai VPS:

```bash
npm test
npm run lint
npm run build
docker compose config
```

Docker runtime cần Docker daemon local hoặc chạy trên VPS. Nếu daemon local không bật thì chỉ xác nhận được cấu hình Compose, chưa xác nhận container chạy thật.
