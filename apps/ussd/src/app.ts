import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { normalizeSlPhone } from "@agripay/validation";

/**
 * USSD/SMS channel service (skeleton — module 00 step 0.8).
 * Module 09 adds the menu state machine, Redis sessions and the internal API client.
 *
 * Gateway contract (typical aggregator): form-encoded sessionId, serviceCode, phoneNumber, text.
 * Response: plain text starting with "CON " (continue) or "END " (finish), ≤ 160 chars.
 */
export function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  app.register(formbody);

  app.get("/health", async () => ({
    status: "ok",
    service: "agripay-ussd",
    time: new Date().toISOString(),
  }));

  app.post<{ Body: { sessionId?: string; phoneNumber?: string; text?: string } }>(
    "/ussd/callback",
    async (req, reply) => {
      const phone = normalizeSlPhone(req.body?.phoneNumber ?? "");
      reply.type("text/plain");
      if (!phone) return "END Sorry, we could not read your phone number.";
      return "END Welcome to AgriPay. USSD services are coming soon.";
    },
  );

  return app;
}
