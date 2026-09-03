import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LegalPage } from "@/components/legal/LegalPage";

// A public route, like /planos: reachable signed out (a visitor deciding
// whether to sign up is exactly who reads this) and signed in. The session
// is read only so the nav can offer the way back into the app rather than
// an "Entrar" button someone is already past.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDescription"),
  };
}

export default async function PrivacyPage() {
  const session = await auth();
  return <LegalPage kind="privacy" signedIn={Boolean(session?.user?.id)} />;
}
