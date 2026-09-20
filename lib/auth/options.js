import GoogleProvider from "next-auth/providers/google";
import { isEmailAllowed } from "./allowlist.js";
import { canSignIn } from "./signInGate.js";

function safeAdminCallback(url, baseUrl) {
  try {
    const target = new URL(url, baseUrl);
    if (target.origin !== new URL(baseUrl).origin) {
      return `${baseUrl}/admin`;
    }
    if (target.pathname === "/admin" || target.pathname === "/admin/") {
      return `${baseUrl}/admin`;
    }
    if (target.pathname.startsWith("/admin/login")) {
      return `${baseUrl}/admin/login`;
    }
    return `${baseUrl}/admin`;
  } catch {
    return `${baseUrl}/admin`;
  }
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  callbacks: {
    async signIn({ user, profile }) {
      return canSignIn({ user, profile });
    },
    async redirect({ url, baseUrl }) {
      return safeAdminCallback(url, baseUrl);
    },
    async jwt({ token, user }) {
      const email = user?.email || token.email || null;
      if (email) token.email = email;
      token.allowed = isEmailAllowed(token.email);
      if (user?.name) token.name = user.name;
      if (user?.image) token.picture = user.image;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email || null;
        session.user.name = token.name || session.user.name || null;
        session.user.image = token.picture || session.user.image || null;
        session.user.allowed = !!token.allowed;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
