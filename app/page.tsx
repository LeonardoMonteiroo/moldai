import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

// Reuses the sidebar's own label -- the dashboard's PageHeader deliberately
// has no title (it's the home screen, and the sidebar already marks this
// section active), so there's no other on-screen text this could drift from.
//
// The brand suffix is spelled out here rather than left to app/layout.tsx's
// `title.template` -- Next.js's own rule: a `template` set in layout.tsx does
// NOT apply to a `title` from a page.tsx in that SAME route segment (only to
// a title from a child segment's page). Root layout + `/` are that one same
// segment; every other route here lives one directory below the layout that
// defines the template, so it composes automatically and only "/" needs this.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Sidebar");
  return { title: `${t("myPatternsLabel")} — MoldAI` };
}

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
