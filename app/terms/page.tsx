import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LegalPage } from "@/components/legal/LegalPage";

// A public route, like /planos and /privacy -- see the note there on why the
// session is read at all.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: t("terms.metaTitle"),
    description: t("terms.metaDescription"),
    alternates: { canonical: "/terms" },
  };
}

export default async function TermsPage() {
  const session = await auth();
  return <LegalPage kind="terms" signedIn={Boolean(session?.user?.id)} />;
}
