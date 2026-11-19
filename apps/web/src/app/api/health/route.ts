import { NextResponse } from "next/server";
import { prisma } from "@agrilink/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  return NextResponse.json(
    { status: db === "ok" ? "ok" : "degraded", db, time: new Date().toISOString() },
    { status: db === "ok" ? 200 : 503 },
  );
}
