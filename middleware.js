import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isEmailAllowed } from "@/lib/auth/allowlist.js";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass.js";
import { legacyHostRedirect } from "@/lib/canonical-host.js";

/**
 * Hard gate for /admin and pipeline APIs.
 * Make.com webhooks stay public (they verify MAKE_WEBHOOK_SECRET themselves).
 * create-job is NOT public — booking creates jobs server-side in book-appointment.
 *
 * /admin/login is excluded from the gate so signed-out users can reach it.
 * After sign-in we always send people to /admin (deep /admin/* may 404).
 *
 * The matcher covers public pages so visio-photography.vercel.app can 308
 * to visioisrael.com. Auth runs only for /admin, /api/pipeline and /api/branding.
 * Public tours at /tour/[jobId] stay unauthenticated.
 *
 * LOCAL-ONLY: DEV_AUTH_BYPASS=1 with NODE_ENV!==production skips the gate
 * so Playwright can drive /admin. Impossible in production (see tests).
 */
export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  const canonical = legacyHostRedirect(request.headers.get("host"), pathname, search);
  if (canonical) {
    return NextResponse.redirect(canonical, 308);
  }

  const guarded =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/pipeline") ||
    pathname.startsWith("/api/branding");
  if (!guarded) return NextResponse.next();

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

  if (isDevAuthBypassEnabled()) {
    if (pathname.startsWith("/admin/")) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
