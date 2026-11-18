import { NextResponse } from "next/server";
import { buildOpenApi } from "@/server/api/openapi";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(buildOpenApi(`${url.protocol}//${url.host}`));
}
