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
        <p className="text-control font-semibold">{t("successHeading")}</p>
        <p className="text-muted-2 text-ui mt-1">{t("successBody")}</p>
        <Link
          href="/login"
          className="rounded-btn bg-olive hover:bg-olive-dark text-control mt-4 inline-block px-4 py-2 font-semibold text-white transition-colors"
        >
          {t("loginLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-muted-2 text-ui">{t("intro")}</p>
      {error && <p className="text-alert text-ui mt-3">{error}</p>}
      <Button
        type="button"
        onClick={onConfirm}
        disabled={status === "loading"}
        className="mt-4"
      >
        {status === "loading" ? t("confirmButtonLoading") : t("confirmButton")}
      </Button>
    </div>
  );
}
