import "server-only";
import { headers } from "next/headers";

/** Client IP / user agent / request id for audit and rate limiting. */
export async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}
