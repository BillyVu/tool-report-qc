FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 3000
CMD ["sh", "-c", "npx tsx server/migrate.ts && npx tsx server/index.ts"]
