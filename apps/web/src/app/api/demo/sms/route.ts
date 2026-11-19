import { NextResponse } from "next/server";
import { prisma } from "@agrilink/db";
import { getSession } from "@/server/auth/session";
import { isDemoMode } from "@/server/demo/flags";
import { PERSONAS } from "@/server/demo/personas";
import { recentDemoSms } from "@/server/demo/sms-log";

export const dynamic = "force-dynamic";

/** Demo only: latest SMS with a readable recipient name, for the on-screen phone panel. */
export async function GET() {
  if (!isDemoMode() || !(await getSession()))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const messages = await recentDemoSms();
  const phones = [...new Set(messages.map((m) => m.to))];
  const [farmers, users, dealers] = await Promise.all([
    prisma.farmer.findMany({
      where: { phone: { in: phones } },
      select: { phone: true, fullName: true },
    }),
    prisma.user.findMany({ where: { phone: { in: phones } }, select: { phone: true, name: true } }),
    prisma.agroDealer.findMany({
      where: { payoutMsisdn: { in: phones } },
      select: { payoutMsisdn: true, org: { select: { name: true } } },
    }),
  ]);
  const nameOf = (phone: string) =>
    PERSONAS.find((p) => p.phone === phone)?.name ??
    farmers.find((f) => f.phone === phone)?.fullName ??
    dealers.find((d) => d.payoutMsisdn === phone)?.org.name ??
    users.find((u) => u.phone === phone)?.name ??
    phone;
  return NextResponse.json({ messages: messages.map((m) => ({ ...m, name: nameOf(m.to) })) });
}
