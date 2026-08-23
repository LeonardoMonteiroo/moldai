import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it -- the
  // dashboard would otherwise render for an account that no longer exists.
  const user = await getUserById(session.user.id);
  if (!user) redirect("/login");
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
