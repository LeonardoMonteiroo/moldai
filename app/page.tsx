import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return <DashboardShell userEmail={session.user.email} />;
}
