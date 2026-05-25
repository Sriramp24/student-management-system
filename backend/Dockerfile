# Stage 1: Build & Install dependencies
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production release
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=5001

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
# Copy source files
COPY package.json server.js ./

# Create data directory and set permissions for node user
RUN mkdir -p /app/data && chown -R node:node /app

# Run as non-root user
USER node

EXPOSE 5001

CMD ["node", "server.js"]
