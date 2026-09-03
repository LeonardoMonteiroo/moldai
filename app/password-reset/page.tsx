import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PasswordResetCard from "@/components/auth/PasswordResetCard";
import { Wordmark } from "@/components/shared/Wordmark";

// Branches the same way PasswordResetCard itself does -- a token present is
// the confirm-new-password form, not the request form, and the tab has to
// say which one you're actually looking at (a moldai-conventions review
// caught this on the first pass: the title was hardcoded to requestHeading
// regardless, so the mailed reset link opened a tab reading "Esqueci minha
// senha" over a "Nova senha" form).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("PasswordReset");
  const token = (await searchParams).token ?? "";
  // Never indexed, and nothing followed out of it: this URL carries a
  // single-use token from a mailed link. Crawlable on purpose (a disallowed
  // URL is never fetched, so the directive below would never be read) --
  // see NOINDEX_ROUTES in lib/seo/site.ts.
  return {
    title: token ? t("confirmHeading") : t("requestHeading"),
    robots: { index: false, follow: false },
  };
}

// One of the three centered-card screens that bypass AppShell (with /login
// and /signup), following app/verify/page.tsx's shape: a thin server
// component reading the token search param as plain data, handing it to a
// client card. Unlike /verify, a missing token is not an error state here --
// it is the entry point reached from "Esqueci minha senha" (no link yet),
// while a token present is the entry point reached from the mailed link.
export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";

  return (
    <div className="bg-paper flex h-full justify-center overflow-y-auto px-4 py-8">
      <div className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[380px] border p-7">
        <Wordmark />
        <PasswordResetCard token={token} />
      </div>
    </div>
  );
}
