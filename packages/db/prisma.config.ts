import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load the monorepo root .env so `pnpm db:*` works from anywhere.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` (run by postinstall, e.g. during `pnpm install` on Vercel) needs no database,
    // so a missing DATABASE_URL must not fail the install. Migrate/seed still need the real URL.
    url:
      process.env.DATABASE_URL ??
      "postgresql://neondb_owner:npg_3uSebQflVCJ8@ep-empty-block-bdn3cqih-pooler.c-8.us-east-2.aws.neon.tech/agripay_db?sslmode=require&channel_binding=require",
  },
});
