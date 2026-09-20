import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isEmailAllowed } from "@/lib/auth/allowlist.js";

/**
 * Hard gate for /admin and pipeline APIs.
 * Make.com webhooks stay public (they verify MAKE_WEBHOOK_SECRET themselves).
 * create-job is NOT public — booking creates jobs server-side in book-appointment.
 *
 * /admin/login is excluded from the gate so signed-out users can reach it.
 * After sign-in we always send people to /admin (deep /admin/* may 404).
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/pipeline/webhook/")) {
    return NextResponse.next();
  }

  // Login must stay reachable while signed out (matcher still hits this path).
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const isApi = pathname.startsWith("/api/");
  const email = token?.email;
  const allowed = !!(email && isEmailAllowed(email));

  if (!token) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("callbackUrl", "/admin");
    return NextResponse.redirect(login);
  }

  if (!allowed) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("error", "NotAllowed");
    return NextResponse.redirect(login);
  }

  // Known admin pages today: /admin and /admin/login only.
  // Any other /admin/... (e.g. stale /admin/property/...) → dashboard.
  if (pathname.startsWith("/admin/")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/pipeline/:path*",
  ],
};
