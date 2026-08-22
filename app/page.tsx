import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  // Set by /pattern/[id] when the pattern is gone or not yours; read here (as
  // plain data, the ?section= precedent in /settings) rather than with a
  // client-side useSearchParams.
  const { missing } = await searchParams;

  return (
    <DashboardShell
      userEmail={session.user.email}
      patternMissing={missing === "pattern"}
    />
  );
}
