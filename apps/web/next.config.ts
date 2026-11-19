import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Single .env at the monorepo root.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@agrilink/ui",
    "@agrilink/validation",
    "@agrilink/i18n",
    "@agrilink/db",
    "@agrilink/payments",
    "@agrilink/finance",
  ],
  serverExternalPackages: ["@node-rs/argon2", "pg", "ioredis", "bullmq"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
