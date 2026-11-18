# Build from the repo root:  docker build -f apps/ussd/Dockerfile -t agripay-ussd .
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @agripay/ussd...
WORKDIR /repo/apps/ussd
EXPOSE 4000
CMD ["pnpm", "start"]
