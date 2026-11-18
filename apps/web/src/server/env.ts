import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  INTERNAL_API_TOKEN: z.string().min(8).default("change-me-internal-token"),
  SMS_PROVIDER: z.enum(["console", "memory", "queue"]).default("console"),
  RATE_LIMIT_STORE: z.enum(["redis", "memory"]).default("redis"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().default("agripay"),
  PAYMENT_PROVIDER_MODE: z.enum(["mock", "sandbox", "live"]).default("mock"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment (lazy, so `next build` works without secrets). */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${issues}. See .env.example at the repo root.`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProd = () => process.env.NODE_ENV === "production";
