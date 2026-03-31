# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY tsconfig.json ./
COPY types ./types
COPY routes ./routes
COPY controllers ./controllers
COPY middleware ./middleware
COPY services ./services
RUN npx tsc
EXPOSE 3000
CMD ["node", "dist/server.js"]
