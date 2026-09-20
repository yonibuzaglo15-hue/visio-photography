import { redirect } from "next/navigation";
import { getAllowedSession } from "@/lib/auth/require.js";
import AdminPanel from "@/src/AdminPanel.jsx";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAllowedSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <AdminPanel
      user={{
        name: session.user.name || "Admin",
        email: session.user.email,
        image: session.user.image || null,
      }}
    />
  );
}
