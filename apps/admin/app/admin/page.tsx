import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AdminDashboard from "../admin-dashboard";

export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/login");
  }

  return <AdminDashboard userEmail={session.email} />;
}
