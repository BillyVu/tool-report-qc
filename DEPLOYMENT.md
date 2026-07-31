# Hướng Dẫn Deploy Ứng Dụng QC Admin Dashboard Lên Web (Production Deployment Guide)

Ứng dụng **QC Admin Dashboard** được xây dựng trên nền tảng **React 19 + TypeScript + Vite + Tailwind CSS v4** với khả năng hỗ trợ xuất file báo cáo Word (`.docx`) và phân tích ảnh tự động bằng **Gemini AI API**.

---

## 1. Cấu Hình Biến Môi Trường (Environment Variables)

Tạo file `.env` trên server production dựa theo file `.env.example`:

```env
# Gemini API Key dành cho AI Detect (OCR, quét IMEI, phân tích màn hình)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
VITE_GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Domain công khai của hệ thống
APP_URL="https://your-qc-app.run.app"

# Cổng ứng dụng (Mặc định: 3000)
PORT=3000
```

---

## 2. Lệnh Build và Chạy Web Production

### B1: Cài đặt dependencies
```bash
npm install
```

### B2: Biên dịch ứng dụng (Build static files)
```bash
npm run build
```
Lệnh này sẽ tạo thư mục `dist/` chứa toàn bộ mã nguồn tĩnh đã được tối ưu hóa.

### B3: Xem trước hoặc Phục vụ file build
```bash
npm run preview
```

---

## 3. Deploy Lên Google Cloud Run / Docker

Tạo file `Dockerfile` ở thư mục gốc (nếu deploy qua container):

```dockerfile
# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve stage with static server / Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 4. Deploy Lên Vercel / Netlify

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: Thêm `VITE_GEMINI_API_KEY` trong phần Environment Variables của dự án.
