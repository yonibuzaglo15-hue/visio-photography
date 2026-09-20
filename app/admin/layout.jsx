"use client";

import { SessionProvider } from "next-auth/react";

export default function AdminLayout({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
