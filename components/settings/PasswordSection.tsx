"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { changePassword } from "@/lib/api-client";

const MIN_PASSWORD_LENGTH = 8;

export function PasswordSection() {
  const t = useTranslations("PasswordSection");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm;

  async function submit() {
    if (!canSubmit) return;
    setStatus("saving");
    setError(null);
    const result = await changePassword(current, next);
    if (result.status === "ok") {
      setStatus("ok");
      setCurrent("");
      setNext("");
      setConfirm("");
    } else {
      setStatus("error");
      setError(result.error ?? t("tooShortError"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-[16px] font-semibold">{t("heading")}</h2>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("currentLabel")}
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("newLabel")}
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("confirmLabel")}
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      {mismatch && (
        <span className="text-alert text-[12px]">{t("mismatchError")}</span>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit || status === "saving"}
          className="bg-ink rounded-item px-[15px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("submitButton")}
        </button>
        {status === "ok" && (
          <span className="text-olive-dark text-[12px]">
            {t("successMessage")}
          </span>
        )}
        {status === "error" && error && (
          <span className="text-alert text-[12px]">{error}</span>
        )}
      </div>
    </section>
  );
}
