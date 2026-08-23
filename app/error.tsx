"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";

// #98: with no error.tsx anywhere in the tree, a thrown Server Component
// (a Postgres restart, a momentarily exhausted Prisma pool) fell through to
// Next's own built-in fallback -- an unstyled English page with no wordmark,
// no retry, no way back into the app, on a product whose entire UI is
// pt-BR. This is the root-level catch; a segment can still add its own
// error.tsx for a more specific fallback (retry re-fetches only that
// segment), inheriting from this one until it does.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("AppError");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="bg-paper flex min-h-screen items-center justify-center px-4"
    >
      <div className="bg-surface border-border rounded-card shadow-card flex w-full max-w-[380px] flex-col items-center gap-4 border p-7 text-center">
        <Wordmark />
        <div className="flex flex-col gap-1">
          <h1 className="text-body font-semibold">{t("heading")}</h1>
          <p className="text-muted text-ui">{t("message")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="chrome" onClick={() => retry()}>
            {t("retryButton")}
          </Button>
          <Button asChild size="chrome">
            <Link href="/">{t("homeLink")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
