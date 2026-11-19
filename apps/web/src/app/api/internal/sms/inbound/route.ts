import { NextResponse } from "next/server";
import { z } from "zod";
import { phoneSL } from "@agrilink/validation";
import { api, requireInternalToken } from "@/server/api";
import { AppError } from "@/server/errors";
import { sendSms } from "@/server/sms";
import { acknowledgePurchase } from "@/server/trade/purchases";

/**
 * Inbound SMS from the USSD/SMS service (Bearer INTERNAL_API_TOKEN).
 * Handles purchase receipt replies: "1" = confirm, "2 <reason>" = report a problem. Module 09 adds keywords.
 */
export const POST = api(async (request: Request) => {
  requireInternalToken(request);
  const { from, text } = z
    .object({ from: phoneSL, text: z.string().max(500) })
    .parse(await request.json());
  const m = text.trim().match(/^([12])\b\s*(.*)$/s);
  if (!m) return NextResponse.json({ handledAs: "UNKNOWN" });
  try {
    const r = await acknowledgePurchase({ phone: from }, m[1] as "1" | "2", {
      reason: m[2]?.trim() || null,
    });
    if (r.result === "CONFIRMED")
      await sendSms(from, `AgriLink: thank you, purchase ${r.ref} confirmed.`, "general");
    return NextResponse.json({
      handledAs: r.result === "CONFIRMED" ? "PURCHASE_ACK" : "PURCHASE_DISPUTE",
      ref: r.ref,
    });
  } catch (e) {
    if (e instanceof AppError) {
      await sendSms(from, `AgriLink: ${e.message}`, "general");
      return NextResponse.json({ handledAs: "PURCHASE_ACK_FAILED", error: e.message });
    }
    throw e;
  }
});
