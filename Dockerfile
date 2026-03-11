# Stage 1: Build
FROM node:18 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# CRITICAL: Copy static files manually (TypeScript doesn't copy non-.ts files)
# The compiled server.ts expects public folder at dist/dashboard/public
RUN cp -r src/dashboard/public dist/dashboard/

# Stage 2: Production (use node:18 when node:18-alpine pull fails due to registry/DNS)
FROM node:18

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# CRUCIAL: Copy package.json files
COPY package*.json ./

# CRUCIAL: Install only production dependencies
RUN npm ci --only=production

# CRUCIAL: Copy the built dist folder from Builder stage
COPY --from=builder /app/dist ./dist

# CRUCIAL: Ensure static files exist at dist/dashboard/public
COPY --from=builder /app/dist/dashboard/public ./dist/dashboard/public

# Expose port 3000 for the dashboard
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
