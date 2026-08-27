import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getUserById, getOnboardingStatus } from "@/lib/db/users";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LandingPage } from "@/components/landing/LandingPage";

// #13: a signed-out visitor gets the public landing's own title/description
// (Decision 1 = A: `/` stays the dashboard for a signed-in user, so this is
// the one route whose metadata genuinely depends on session state).
// Otherwise reuses the sidebar's own label -- the dashboard's PageHeader
// deliberately has no title (it's the home screen, and the sidebar already
// marks this section active), so there's no other on-screen text this could
// drift from.
//
// The brand suffix is spelled out here rather than left to app/layout.tsx's
// `title.template` -- Next.js's own rule: a `template` set in layout.tsx does
// NOT apply to a `title` from a page.tsx in that SAME route segment (only to
// a title from a child segment's page). Root layout + `/` are that one same
// segment; every other route here lives one directory below the layout that
// defines the template, so it composes automatically and only "/" needs this.
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.email) {
    const t = await getTranslations("Landing");
    return { title: t("metaTitle"), description: t("metaDescription") };
  }
  const t = await getTranslations("Sidebar");
  return { title: `${t("myPatternsLabel")} — MoldAI` };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  const session = await auth();
  // #13: a signed-out visitor gets the public landing, not a redirect to
  // /login -- the only way to reach /login or /signup before this was a
  // bare centered card with no product explanation.
  if (!session?.user?.email || !session.user.id) return <LandingPage />;

  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it -- the
  // dashboard would otherwise render for an account that no longer exists.
  const [user, onboarding] = await Promise.all([
    getUserById(session.user.id),
    getOnboardingStatus(session.user.id),
  ]);
  if (!user || !onboarding) redirect("/login");
  // #14: a signed-in account that has never completed (or skipped) the
  // post-signup onboarding wizard is sent there instead of the dashboard.
  // Existing accounts were backfilled to "already onboarded" by the
  // 20260826150000_add_user_onboarding migration, so this only ever fires
  // for an account created after that migration shipped.
  if (onboarding.onboardedAt === null) redirect("/onboarding");

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
