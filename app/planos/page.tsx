import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { PricingPage } from "@/components/pricing/PricingPage";
import type { PlanId } from "@/lib/types";

// #15: a public route -- unlike every other full-page screen, it does not
// go through requireUser()/redirect. It renders for a signed-out visitor
// (design 5c's actual audience: someone deciding whether to sign up) and
// for a signed-in one too (Decision: "renders for anonymous and signed-in
// visitors alike"), in which case the current plan's card shows "Plano
// atual" instead of a CTA.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pricing");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function PlanosPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  let currentPlan: PlanId | null = null;
  if (session?.user?.id) {
    const wallet = await loadWallet(session.user.id);
    currentPlan = wallet?.plan ?? null;
  }

  return <PricingPage signedIn={signedIn} currentPlan={currentPlan} />;
}
