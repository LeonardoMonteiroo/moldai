"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { verifyEmail } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export default function VerifyCard({ token }: { token: string }) {
  const t = useTranslations("Verify");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function onConfirm() {
    setStatus("loading");
    setError("");
    try {
      const result = await verifyEmail(token);
      if (result.status === "error") {
        setStatus("idle");
        setError(t(`errors.${result.error}`));
        return;
      }
      setStatus("done");
    } catch {
      setStatus("idle");
      setError(t("errors.bad_body"));
    }
  }

  if (status === "done") {
    return (
      <div className="mt-3">
        {/* Own <h1>, not app/verify/page.tsx's -- a static server-rendered
            heading alongside this one produced two headings at once (fixed
            after the redesign handoff's Round 2 reference screenshot showed
            only one), the same fix SignupCard's success state needed. */}
        <h1 className="text-body font-semibold">{t("successHeading")}</h1>
        <p className="text-ink text-ui mt-1 leading-[1.6]">
          {t("successBody")}
        </p>
        {/* asChild rather than a Link wearing hand-written button classes:
            those were a second copy of the primitive that had already drifted
            from it (inline-block, so it never stretched). */}
        <Button asChild className="mt-4 w-full">
          <Link href="/login">{t("loginLink")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <h1 className="text-body font-semibold">{t("heading")}</h1>
      {/* Full ink, not muted: the design colours the password-reset intro
          explicitly and leaves this one to inherit, because here the sentence
          IS the screen -- there is nothing else to read. */}
      <p className="text-ink text-ui mt-2 leading-[1.6]">{t("intro")}</p>
      {/* text-meta, matching FieldError: this is a hand-written paragraph
          rather than a Field, so the primitive's own sizing never reached it. */}
      {error && <p className="text-alert text-meta mt-3">{error}</p>}
      {/* w-full because this card is a plain div, not the flex-col form that
          stretches the auth screens' buttons for free. */}
      <Button
        type="button"
        onClick={onConfirm}
        disabled={status === "loading"}
        className="mt-4 w-full"
      >
        {status === "loading" ? t("confirmButtonLoading") : t("confirmButton")}
      </Button>
      <p className="text-center">
        <Link
          href="/login"
          className="text-muted text-meta mt-3 inline-block hover:underline"
        >
          {t("backToLoginLink")}
        </Link>
      </p>
    </div>
  );
}
