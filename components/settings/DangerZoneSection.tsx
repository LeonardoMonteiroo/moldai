"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { deleteAccount } from "@/lib/api-client";

export function DangerZoneSection({ userEmail }: { userEmail: string }) {
  const t = useTranslations("DangerZoneSection");
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = typedEmail === userEmail && password.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setStatus("deleting");
    setError(null);
    const result = await deleteAccount(password);
    if (result.status === "ok") {
      await signOut({ callbackUrl: "/login" });
    } else {
      setStatus("error");
      setError(result.error ?? t("genericError"));
    }
  }

  return (
    <section className="bg-amber-bg border-alert rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="text-alert font-display text-[16px] font-semibold">
        {t("heading")}
      </h2>
      <p className="text-muted-2 text-[12.5px] leading-[1.5]">{t("warning")}</p>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("emailConfirmLabel", { email: userEmail })}
        <input
          value={typedEmail}
          onChange={(e) => setTypedEmail(e.target.value)}
          className="border-border rounded-item bg-surface border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("passwordLabel")}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-border rounded-item bg-surface border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit || status === "deleting"}
          className="border-alert text-alert hover:bg-amber-bg rounded-btn border px-[15px] py-[9px] text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("submitButton")}
        </button>
        {status === "error" && error && (
          <span className="text-alert text-[12px]">{error}</span>
        )}
      </div>
    </section>
  );
}
