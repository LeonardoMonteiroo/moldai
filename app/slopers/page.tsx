import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { SlopersShell } from "@/components/slopers/SlopersShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Slopers");
  return { title: t("title") };
}

export default async function SlopersPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const wallet = await loadWallet(session.user.id);
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it -- this
  // page would otherwise render for an account that no longer exists.
  if (!wallet) redirect("/login");

  return (
    <SlopersShell
      userEmail={session.user.email}
      credits={buildCredits(wallet, new Date())}
    />
  );
}
