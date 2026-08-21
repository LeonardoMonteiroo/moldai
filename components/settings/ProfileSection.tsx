"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateProfile } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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

  const invalid = status === "error" && !!error;

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-body font-semibold">{t("heading")}</h2>
      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="profile-name">{t("nameLabel")}</FieldLabel>
          <Input
            id="profile-name"
            value={name}
            aria-invalid={invalid || undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {invalid && <FieldError>{error}</FieldError>}
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="profile-email">{t("emailLabel")}</FieldLabel>
          <Input id="profile-email" value={email} disabled />
          <FieldDescription>{t("emailHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={status === "saving"}>
          {t("saveButton")}
        </Button>
        {status === "ok" && (
          <span className="text-olive-dark text-ui">{t("saveSuccess")}</span>
        )}
      </div>
    </section>
  );
}
