"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { changePassword } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/account/settings";

export function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
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
    (hasPassword ? current.length > 0 : true) &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm;

  async function submit() {
    if (!canSubmit) return;
    setStatus("saving");
    setError(null);
    try {
      const result = await changePassword(
        hasPassword ? current : undefined,
        next,
      );
      if (result.status === "ok") {
        setStatus("ok");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setStatus("error");
        setError(
          result.error ? t(`errors.${result.error}`) : t("tooShortError"),
        );
      }
    } catch {
      setStatus("error");
      setError(t("errors.bad_body"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-body font-semibold">
        {hasPassword ? t("heading") : t("setHeading")}
      </h2>
      {!hasPassword && (
        <p className="text-muted-2 text-ui leading-[1.5]">{t("setNote")}</p>
      )}
      {hasPassword && <p className="text-muted-2 text-ui">{t("hintNote")}</p>}
      <FieldGroup className="max-w-[420px]">
        {hasPassword && (
          <Field data-invalid={status === "error" || undefined}>
            <FieldLabel htmlFor="password-current">
              {t("currentLabel")}
            </FieldLabel>
            <Input
              id="password-current"
              type="password"
              value={current}
              aria-invalid={status === "error" || undefined}
              onChange={(event) => setCurrent(event.target.value)}
            />
            {status === "error" && error && <FieldError>{error}</FieldError>}
          </Field>
        )}
        <Field data-invalid={(!hasPassword && status === "error") || undefined}>
          <FieldLabel htmlFor="password-new">{t("newLabel")}</FieldLabel>
          <Input
            id="password-new"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
          />
          {!hasPassword && status === "error" && error && (
            <FieldError>{error}</FieldError>
          )}
        </Field>
        <Field data-invalid={mismatch || undefined}>
          <FieldLabel htmlFor="password-confirm">
            {t("confirmLabel")}
          </FieldLabel>
          <Input
            id="password-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={mismatch || undefined}
          />
          {mismatch && <FieldError>{t("mismatchError")}</FieldError>}
        </Field>
      </FieldGroup>
      {/* The design rules the action row off from the fields above it. */}
      <div className="border-line flex items-center gap-3 border-t pt-3">
        <Button onClick={submit} disabled={!canSubmit || status === "saving"}>
          {hasPassword ? t("submitButton") : t("setSubmitButton")}
        </Button>
        {status === "ok" ? (
          <span className="text-olive-dark text-ui">
            {hasPassword ? t("successMessage") : t("setSuccessMessage")}
          </span>
        ) : (
          hasPassword && (
            <span className="text-muted text-ui">{t("deviceNote")}</span>
          )
        )}
      </div>
    </section>
  );
}
