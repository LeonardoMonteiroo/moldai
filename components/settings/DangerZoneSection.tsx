"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { deleteAccount } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function DangerZoneSection({
  userEmail,
  hasPassword,
}: {
  userEmail: string;
  hasPassword: boolean;
}) {
  const t = useTranslations("DangerZoneSection");
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    typedEmail === userEmail && (hasPassword ? password.length > 0 : true);

  async function submit() {
    if (!canSubmit) return;
    setStatus("deleting");
    setError(null);
    try {
      const result = await deleteAccount(hasPassword ? password : undefined);
      if (result.status === "ok") {
        await signOut({ callbackUrl: "/login" });
      } else {
        setStatus("error");
        setError(
          result.error ? t(`errors.${result.error}`) : t("genericError"),
        );
      }
    } catch {
      setStatus("error");
      setError(t("genericError"));
    }
  }

  return (
    <section className="bg-amber-bg border-alert rounded-card grid max-w-[720px] grid-cols-1 gap-4 border p-[18px] md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="text-alert font-display text-body font-semibold">
          {t("heading")}
        </h2>
        <p className="text-muted-2 text-ui leading-[1.5]">{t("warning")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="danger-email">
              {t("emailConfirmLabel", { email: userEmail })}
            </FieldLabel>
            <Input
              id="danger-email"
              className="bg-surface"
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
            />
          </Field>
          {hasPassword && (
            <Field data-invalid={status === "error" || undefined}>
              <FieldLabel htmlFor="danger-password">
                {t("passwordLabel")}
              </FieldLabel>
              <Input
                id="danger-password"
                className="bg-surface"
                type="password"
                value={password}
                aria-invalid={status === "error" || undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
              {status === "error" && error && <FieldError>{error}</FieldError>}
            </Field>
          )}
        </FieldGroup>
        {!hasPassword && status === "error" && error && (
          <p className="text-alert text-ui">{error}</p>
        )}
        <Button
          variant="destructiveOutline"
          onClick={submit}
          disabled={!canSubmit || status === "deleting"}
        >
          {t("submitButton")}
        </Button>
      </div>
    </section>
  );
}
