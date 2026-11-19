import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 proxy (formerly "middleware").
 * Cheap, cookie-only gate: unauthenticated visitors to a portal are sent to /login.
 * Full session + role checks happen in each portal layout (requirePortal) and in every server action.
 */
const PROTECTED_PREFIXES = [
  "/farmer",
  "/agent",
  "/coop",
  "/buyer",
  "/lender",
  "/dealer",
  "/programme",
  "/admin",
  "/settings",
  "/select-context",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !request.cookies.has("agrilink_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|api/).*)"],
};
