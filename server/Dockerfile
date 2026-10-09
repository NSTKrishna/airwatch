# AirWatch API and simulator worker (same image, different command).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# The Prisma CLI stays in the image: the migrate job runs `prisma migrate deploy`.
RUN npm ci && npx prisma generate && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production PORT=4000
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
