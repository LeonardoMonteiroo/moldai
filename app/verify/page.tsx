import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import VerifyCard from "@/components/auth/VerifyCard";
import { Wordmark } from "@/components/shared/Wordmark";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Verify");
  // Never indexed, and nothing followed out of it: this URL carries a
  // single-use token from a mailed link. Crawlable on purpose (a disallowed
  // URL is never fetched, so the directive below would never be read) --
  // see NOINDEX_ROUTES in lib/seo/site.ts.
  return { title: t("heading"), robots: { index: false, follow: false } };
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("Verify");
  const token = (await searchParams).token ?? "";

  return (
    <div className="bg-paper flex h-full justify-center overflow-y-auto px-4 py-8">
      <div className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[380px] border p-7">
        <Wordmark />
        {token ? (
          // The heading itself lives in VerifyCard, not here -- it has to
          // switch to the success heading once verification completes, and a
          // static server-rendered <h1> alongside it produced two headings
          // at once (fixed after the redesign handoff's Round 2 reference
          // screenshot showed only one).
          <VerifyCard token={token} />
        ) : (
          <>
            <h1 className="text-body mt-4 font-semibold">{t("heading")}</h1>
            <p className="text-alert text-ui mt-3">{t("missingToken")}</p>
          </>
        )}
      </div>
    </div>
  );
}
