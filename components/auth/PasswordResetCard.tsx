"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { requestPasswordReset, confirmPasswordReset } from "@/lib/api-client";
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

// A blank token renders the request form (reached from "Esqueci minha
// senha"); a token present renders the new-password form (reached from the
// mailed link) -- the same searchParams-branches-the-client-card shape as
// VerifyCard, but with two distinct forms instead of one confirm action.
export default function PasswordResetCard({ token }: { token: string }) {
  return token ? <ConfirmForm token={token} /> : <RequestForm />;
}

function RequestForm() {
  const t = useTranslations("PasswordReset");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.status === "error") {
      setError(t(`errors.${result.error}`));
      return;
    }
    // The route always answers ok regardless of whether the address exists --
    // this card must say the same generic thing either way, or the UI itself
    // becomes the enumeration oracle the route was built not to be.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-3">
        <h1 className="text-body font-semibold">{t("requestSentHeading")}</h1>
        <p className="text-muted-2 text-ui mt-2">{t("requestSentBody")}</p>
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
    <>
      <h1 className="text-body mt-4 font-semibold">{t("requestHeading")}</h1>
      <p className="text-muted-2 text-ui mt-2">{t("requestIntro")}</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="reset-email">{t("emailLabel")}</FieldLabel>
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              aria-invalid={!!error || undefined}
              className="bg-surface-alt"
            />
            {!!error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={loading} className="mt-1">
          {loading ? t("requestButtonLoading") : t("requestButton")}
        </Button>
      </form>
      <p className="text-muted text-meta mt-4 text-center">
        {t.rich("backToLoginNote", {
          a: (chunks) => (
            <Link href="/login" className="text-olive-dark font-medium">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}

function ConfirmForm({ token }: { token: string }) {
  const t = useTranslations("PasswordReset");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const mismatch =
    password.length > 0 && confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    const result = await confirmPasswordReset(token, password);
    setLoading(false);
    if (result.status === "error") {
      setError(t(`errors.${result.error}`));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-3">
        <h1 className="text-body font-semibold">
          {t("confirmSuccessHeading")}
        </h1>
        <p className="text-muted-2 text-ui mt-2">{t("confirmSuccessBody")}</p>
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
    <>
      <h1 className="text-body mt-4 font-semibold">{t("confirmHeading")}</h1>
      <p className="text-muted-2 text-ui mt-2">{t("confirmIntro")}</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="reset-password">
              {t("newPasswordLabel")}
            </FieldLabel>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
              aria-invalid={!!error || undefined}
              className="bg-surface-alt"
            />
            {!!error && <FieldError>{error}</FieldError>}
          </Field>
          <Field data-invalid={mismatch || undefined}>
            <FieldLabel htmlFor="reset-confirm">
              {t("confirmPasswordLabel")}
            </FieldLabel>
            <Input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
              className="bg-surface-alt"
            />
            {mismatch && <FieldError>{t("mismatchError")}</FieldError>}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={!canSubmit || loading} className="mt-1">
          {loading ? t("confirmButtonLoading") : t("confirmButton")}
        </Button>
      </form>
    </>
  );
}
