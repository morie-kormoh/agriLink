import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { safeEqual } from "./crypto";
import { env } from "./env";
import { AppError, httpStatus } from "./errors";

/** Wrap a route handler: maps AppError/ZodError to JSON responses with proper status codes. */
export function api<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 422 },
        );
      }
      if (e instanceof AppError) {
        return NextResponse.json(
          { error: e.message, code: e.code, messageKey: e.messageKey },
          { status: httpStatus(e) },
        );
      }
      // Next.js redirect()/notFound() thrown from shared helpers
      const digest =
        e && typeof e === "object" && "digest" in e
          ? String((e as { digest: unknown }).digest)
          : "";
      if (digest.startsWith("NEXT_REDIRECT")) {
        if (digest.includes("/select-context")) {
          return NextResponse.json(
            {
              error: "Choose a workspace first (POST /api/v1/me/context).",
              code: "CONTEXT_REQUIRED",
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: "Please sign in again.", code: "UNAUTHENTICATED" },
          { status: 401 },
        );
      }
      if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) {
        return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      }
      console.error("[api]", e);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}

/** Service-to-service auth for apps/ussd and apps/worker. */
export function requireInternalToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, env().INTERNAL_API_TOKEN)) {
    throw new AppError("UNAUTHENTICATED", "Invalid internal token.");
  }
}
