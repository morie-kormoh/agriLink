import "server-only";
import { NextResponse } from "next/server";
import type { Role } from "@agripay/db";
import { api } from "../api";
import { type CurrentUser, requireActor } from "../auth/actor";
import { AppError } from "../errors";

/**
 * Helpers for /api/v1 route handlers (the API used by the native mobile app, USSD service and partners).
 *  - Auth: `Authorization: Bearer <accessToken>` (mobile) or the web session cookie.
 *  - Success: `{ "data": … }` (+ `meta` for lists). Errors: `{ "error", "code" }` with a proper HTTP status.
 *  - Money is returned as strings with 2 decimals; dates as ISO-8601.
 */
export type RouteCtx<P> = { params: Promise<P> };

interface HandlerArgs<P> {
  request: Request;
  params: P;
  current: CurrentUser;
  query: URLSearchParams;
  body: () => Promise<unknown>;
}

export function v1<P = Record<string, never>>(
  fn: (args: HandlerArgs<P>) => Promise<unknown>,
  opts: { roles?: readonly Role[]; status?: number } = {},
) {
  return api(async (request: Request, ctx: RouteCtx<P>) => {
    const current = await requireActor(opts.roles);
    const params = (await ctx?.params) ?? ({} as P);
    const result = await fn({
      request,
      params,
      current,
      query: new URL(request.url).searchParams,
      body: () => readJson(request),
    });
    if (result instanceof Response) return result;
    return NextResponse.json(result === undefined ? { data: null } : result, {
      status: opts.status ?? 200,
    });
  });
}

/** Same as v1() but without authentication (sign-in endpoints). */
export function v1Public<P = Record<string, never>>(
  fn: (args: Omit<HandlerArgs<P>, "current">) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return api(async (request: Request, ctx: RouteCtx<P>) => {
    const params = (await ctx?.params) ?? ({} as P);
    const result = await fn({
      request,
      params,
      query: new URL(request.url).searchParams,
      body: () => readJson(request),
    });
    if (result instanceof Response) return result;
    return NextResponse.json(result, { status: opts.status ?? 200 });
  });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION", "Request body must be JSON.");
  }
}

export const data = <T>(d: T) => ({ data: d });
export const page = <T>(d: T[], meta: { page: number; pages: number; total: number }) => ({
  data: d,
  meta,
});
export const queryObject = (q: URLSearchParams) =>
  Object.fromEntries([...q.entries()].filter(([, v]) => v !== ""));
