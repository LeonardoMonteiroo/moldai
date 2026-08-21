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
      setError(result.error ? t(`errors.${result.error}`) : t("tooShortError"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-body font-semibold">{t("heading")}</h2>
      <FieldGroup className="max-w-[420px]">
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
        <Field>
          <FieldLabel htmlFor="password-new">{t("newLabel")}</FieldLabel>
          <Input
            id="password-new"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        {/* The mismatch now belongs to the field it describes, instead of floating
            at the end of the form with nothing associating it to a control. */}
        <Field data-invalid={mismatch || undefined}>
          <FieldLabel htmlFor="password-confirm">
            {t("confirmLabel")}
          </FieldLabel>
          <Input
            id="password-confirm"
            type="password"
            value={confirm}
            aria-invalid={mismatch || undefined}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {mismatch && <FieldError>{t("mismatchError")}</FieldError>}
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!canSubmit || status === "saving"}>
          {t("submitButton")}
        </Button>
        {status === "ok" && (
          <span className="text-olive-dark text-ui">{t("successMessage")}</span>
        )}
      </div>
    </section>
  );
}
