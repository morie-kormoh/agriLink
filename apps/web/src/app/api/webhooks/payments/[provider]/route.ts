import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/api";
import { handleProviderCallback } from "@/server/payments/service";

const providers = z.enum(["MOCK", "ORANGE_MONEY", "AFRIMONEY", "QMONEY", "SAPS", "BANK"]);

/** Provider callbacks: stored raw, signature-verified, safe to replay. */
export const POST = api(
  async (request: Request, ctx: { params: Promise<{ provider: string }> }) => {
    const provider = providers.parse((await ctx.params).provider.toUpperCase());
    const rawBody = await request.text();
    const headers = Object.fromEntries(
      [...request.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]),
    );
    const r = await handleProviderCallback(provider, headers, rawBody);
    return NextResponse.json(r);
  },
);
