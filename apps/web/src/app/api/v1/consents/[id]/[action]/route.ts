import { respondConsentSchema, revokeConsentSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { notFound } from "@/server/errors";
import { respondConsent, revokeConsent } from "@/server/passport/consent";

/**
 * POST /consents/{id}/respond  { decision: GRANT|DECLINE, pin }
 * POST /consents/{id}/revoke   { pin }   — stops access immediately
 */
export const POST = v1<{ id: string; action: string }>(async ({ current, params, body }) => {
  if (params.action === "respond")
    return {
      data: await respondConsent(
        current.actor,
        params.id,
        respondConsentSchema.parse(await body()),
      ),
    };
  if (params.action === "revoke")
    return {
      data: await revokeConsent(current.actor, params.id, revokeConsentSchema.parse(await body())),
    };
  throw notFound("Action");
});
