import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getOnboardingStatus } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("pageTitle") };
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const [status, wallet] = await Promise.all([
    getOnboardingStatus(session.user.id),
    loadWallet(session.user.id),
  ]);
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it.
  if (!status || !wallet) redirect("/login");
  // Already seen -- app/page.tsx is the only entry point that sends a
  // session user here, but a stale bookmark or a back button must not
  // re-show the wizard to an account that already finished (or skipped) it.
  if (status.onboardedAt !== null) redirect("/");

  return <OnboardingShell credits={buildCredits(wallet, new Date())} />;
}
