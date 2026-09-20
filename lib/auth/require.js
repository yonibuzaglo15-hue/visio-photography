import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { authOptions } from "./options.js";
import { isEmailAllowed } from "./allowlist.js";

/**
 * Server Components / Route Handlers: return session only if allow-listed.
 */
export async function getAllowedSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isEmailAllowed(session.user.email)) {
    return null;
  }
  return session;
}

/**
 * API Route Handlers: 401 if signed out, 403 if signed in but not allow-listed.
 * Returns { session } or { errorResponse }.
 */
export async function requireAllowedApi(request) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.email) {
    return {
      errorResponse: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  if (!isEmailAllowed(token.email)) {
    return {
      errorResponse: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    session: {
      user: {
        email: token.email,
        name: token.name || null,
        image: token.picture || null,
        allowed: true,
      },
    },
  };
}
