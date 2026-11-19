# Multi-stage production build for Nest by Ammakkili Storefront & Admin
# Pinned to Node.js 22 Alpine LTS
FROM node:24-alpine3.20 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine3.20 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Security: Non-root execution
USER node

# Copy production node_modules from deps stage
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./

# Explicit production application paths (tests, fixtures, stylist samples strictly omitted)
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

EXPOSE 3000
CMD ["node", "src/server.js"]

