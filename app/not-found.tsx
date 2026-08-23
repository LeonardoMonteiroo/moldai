import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";

// #98: with no not-found.tsx, any wrong URL -- including a stale bookmark to
// a pre-rename route like /molde/[id] or /configuracoes -- rendered Next's
// default "404 | This page could not be found.": English, and no way back
// into the app.
export default async function NotFound() {
  const t = await getTranslations("NotFoundPage");

  return (
    <div className="bg-paper flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface border-border rounded-card shadow-card flex w-full max-w-[380px] flex-col items-center gap-4 border p-7 text-center">
        <Wordmark />
        <div className="flex flex-col gap-1">
          <h1 className="text-body font-semibold">{t("heading")}</h1>
          <p className="text-muted text-ui">{t("message")}</p>
        </div>
        <Button asChild size="chrome">
          <Link href="/">{t("homeLink")}</Link>
        </Button>
      </div>
    </div>
  );
}
