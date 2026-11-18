# Build from the repo root:  docker build -f apps/worker/Dockerfile -t agripay-worker .
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @agripay/worker...
WORKDIR /repo/apps/worker
CMD ["pnpm", "start"]
