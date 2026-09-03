import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { PricingPage } from "@/components/pricing/PricingPage";
import type { PlanId } from "@/lib/types";
import {
  CURRENCY,
  PLAN_PRICE_CENTS,
  SELF_SERVE_PLAN_IDS,
  priceDecimalString,
} from "@/lib/billing/plans";
import { SITE_NAME, absoluteUrl, siteRootUrl } from "@/lib/seo/site";
import {
  jsonLdGraph,
  organizationNode,
  softwareApplicationNode,
} from "@/lib/seo/jsonLd";

// #15: a public route -- unlike every other full-page screen, it does not
// go through requireUser()/redirect. It renders for a signed-out visitor
// (design 5c's actual audience: someone deciding whether to sign up) and
// for a signed-in one too (Decision: "renders for anonymous and signed-in
// visitors alike"), in which case the current plan's card shows "Plano
// atual" instead of a CTA.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pricing");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // Relative, resolved against the root layout's metadataBase. Without a
    // canonical, every ?utm_* variant of this URL is a separate indexable
    // duplicate.
    alternates: { canonical: "/planos" },
  };
}

export default async function PlanosPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  let currentPlan: PlanId | null = null;
  if (session?.user?.id) {
    const wallet = await loadWallet(session.user.id);
    currentPlan = wallet?.plan ?? null;
  }

  // Four real, published prices and no structured data at all before this --
  // the clearest rich-result gap on the site. Every figure renders from
  // lib/billing/plans.ts, the same module the cards themselves read, so the
  // schema cannot quote a price Stripe would not charge.
  //
  // Only SELF_SERVE_PLAN_IDS get an Offer. Confeccao's price is real and its
  // card renders like the others, but its CTA is permanently disabled behind
  // an "em breve" badge because there is no sales channel to route it to --
  // and an `Offer` is a machine-readable claim that something is for sale.
  // Emitting one would be the same overclaim the pricing copy already
  // refuses to make, in the format a search engine actually parses.
  const site = siteRootUrl();
  const tPlan = await getTranslations("PlanSection");
  const tLanding = await getTranslations("Landing");
  const planosUrl = absoluteUrl("/planos");
  const structuredData = jsonLdGraph([
    organizationNode(site, SITE_NAME, tLanding("metaDescription")),
    softwareApplicationNode(site, {
      name: SITE_NAME,
      description: tLanding("metaDescription"),
      url: site,
      offers: SELF_SERVE_PLAN_IDS.map((id) => ({
        name: tPlan(`plans.${id}.name`),
        price: priceDecimalString(PLAN_PRICE_CENTS[id]),
        currency: CURRENCY.toUpperCase(),
        url: planosUrl,
      })),
    }),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      <PricingPage signedIn={signedIn} currentPlan={currentPlan} />
    </>
  );
}
