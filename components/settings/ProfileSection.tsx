"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateProfile } from "@/lib/api-client";

export function ProfileSection({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const t = useTranslations("ProfileSection");
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError(t("nameRequired"));
      setStatus("error");
      return;
    }
    setStatus("saving");
    setError(null);
    const result = await updateProfile(name.trim());
    if (result.status === "ok") {
      setStatus("ok");
    } else {
      setStatus("error");
      setError(result.error ?? t("saveError"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-[16px] font-semibold">{t("heading")}</h2>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("nameLabel")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("emailLabel")}
        <input
          value={email}
          disabled
          className="border-border rounded-item bg-surface-alt text-muted-2 border px-[13px] py-[9px] text-[13px] outline-none disabled:opacity-70"
        />
        <span className="text-muted text-[11px]">{t("emailHint")}</span>
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="bg-ink rounded-item px-[15px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("saveButton")}
        </button>
        {status === "ok" && (
          <span className="text-olive-dark text-[12px]">
            {t("saveSuccess")}
          </span>
        )}
        {status === "error" && error && (
          <span className="text-alert text-[12px]">{error}</span>
        )}
      </div>
    </section>
  );
}
