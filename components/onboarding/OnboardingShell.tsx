"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Wordmark } from "@/components/shared/Wordmark";
import * as api from "@/lib/api-client";
import { errorCode } from "@/lib/api-client";
import { COSTS, type Credits } from "@/lib/types";

type Step = 1 | 2 | 3;

// #14: honest research data (User.workStyle) -- kept local to the client
// bundle rather than imported from lib/db/users.ts, which pulls in Prisma.
const WORK_STYLES = ["patternmaker", "brand", "personal"] as const;
type WorkStyle = (typeof WORK_STYLES)[number];

const SUGGESTIONS = [
  "suggestionBlouse",
  "suggestionDress",
  "suggestionTshirt",
] as const;

/**
 * The 3-step post-signup wizard (design 5b). A full-page centered card with
 * no header, like /login, /signup and /verify -- rendering its own Wordmark
 * rather than going through AppShell, which needs credits/userEmail this
 * screen has no reason to fetch just for its own chrome.
 *
 * Local useState only, no Zustand store: there is no cross-component shared
 * state and no URL requirement for step choice (CLAUDE.md's "don't add
 * abstractions beyond what's needed", the /settings precedent).
 */
export function OnboardingShell({ credits }: { credits: Credits }) {
  const t = useTranslations("Onboarding");
  const tSizeCharts = useTranslations("SizeCharts");
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [workStyle, setWorkStyle] = useState<WorkStyle | null>(null);

  const [chartBusy, setChartBusy] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  function moveWorkStyleSelection(delta: number) {
    const idx = workStyle ? WORK_STYLES.indexOf(workStyle) : -1;
    const next =
      WORK_STYLES[(idx + delta + WORK_STYLES.length) % WORK_STYLES.length];
    setWorkStyle(next);
  }

  // Stamps onboardedAt (best-effort -- a failed stamp must not strand the
  // user on this screen when a pattern was already created, or block
  // "Pular por agora" from actually leaving) then navigates.
  async function finish(href: string) {
    try {
      await api.completeOnboarding(workStyle ?? undefined);
    } catch {
      // Non-fatal: worst case the wizard shows once more on a later login.
    }
    router.push(href);
  }

  async function handleSkip() {
    if (skipping) return;
    setSkipping(true);
    await finish("/");
  }

  async function handleUseDefaultChart() {
    if (chartBusy) return;
    setChartBusy(true);
    setChartError(null);
    try {
      const charts = await api.listSizeCharts();
      const chart =
        charts.find((c) => c.isSystem && c.gender === "female") ?? charts[0];
      if (chart) await api.activateSizeChart(chart.id);
      setStep(3);
    } catch (err) {
      setChartError(errorCode(err));
    } finally {
      setChartBusy(false);
    }
  }

  async function handleGenerate() {
    const trimmed = message.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setGenError(null);
    try {
      const { id } = await api.createPattern();
      let result = await api.generate(id, trimmed);
      // #215: this step has no ClarifyCard to show the AI's questions, so a
      // vague first message ("clarify") used to strand the user with a
      // generic error on their very first pattern. Reusing the exact
      // mechanism ClarifyCard's own "gerar assim mesmo" button uses --
      // resend with `answering: true`, which lib/ai/decision.ts's answering
      // guard forces to apply (with the model's best-guess defaults) even if
      // it tries to ask again -- means onboarding never blocks on a question
      // it has no UI to ask. This costs the one credit apply always costs;
      // the first, clarifying attempt itself was free (ask never debits).
      if (result.status === "clarify") {
        result = await api.generate(id, t("step3.autoDefaultMessage"), true);
      }
      // Anything other than a real draft (declined/error/insufficient_credits,
      // or a thrown ApiError below) leaves the user on this step with a
      // notice rather than navigating to a blank pattern.
      if (result.status !== "ok" && result.status !== "conflict") {
        setGenError(t("step3.generateError"));
        setSubmitting(false);
        return;
      }
      await finish(`/pattern/${id}`);
    } catch {
      setGenError(t("step3.generateError"));
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-paper flex h-full justify-center overflow-y-auto px-4 py-8">
      <div className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[600px] border p-7">
        <Wordmark />
        <div className="mt-[18px] flex flex-col gap-[6px]">
          <span className="text-muted-2 text-meta tracking-eyebrow font-semibold uppercase">
            {t("stepLabel", { n: step })}
          </span>
          <Progress
            value={Math.round((step / 3) * 100)}
            aria-label={t("stepLabel", { n: step })}
            className="bg-track h-[6px]"
          />
        </div>

        {step === 1 && (
          <div className="mt-5 flex flex-col gap-4">
            <h1 className="text-body font-semibold">{t("step1.title")}</h1>
            <div
              role="radiogroup"
              aria-label={t("step1.title")}
              className="flex flex-col gap-[10px]"
              // Each option button is independently focusable/tabbable; the
              // group container itself is never a tab stop (tabIndex -1
              // satisfies eslint-plugin-jsx-a11y's focusability check for
              // the radiogroup role without adding a redundant stop).
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                  event.preventDefault();
                  moveWorkStyleSelection(1);
                } else if (
                  event.key === "ArrowUp" ||
                  event.key === "ArrowLeft"
                ) {
                  event.preventDefault();
                  moveWorkStyleSelection(-1);
                }
              }}
            >
              {WORK_STYLES.map((style) => {
                const selected = workStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    // The button's own text content also renders the
                    // subtitle, so an explicit aria-label keeps the radio's
                    // accessible name to just the option title rather than
                    // the title and subtitle concatenated.
                    aria-label={t(`step1.${style}.title`)}
                    onClick={() => setWorkStyle(style)}
                    className={
                      "rounded-item flex flex-col gap-1 border p-[14px] text-left transition-colors " +
                      (selected
                        ? "border-olive bg-olive-tint border-2"
                        : "border-border hover:bg-surface-alt")
                    }
                  >
                    <span className="text-control font-semibold">
                      {t(`step1.${style}.title`)}
                    </span>
                    <span className="text-muted-2 text-ui">
                      {t(`step1.${style}.subtitle`)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-[10px]">
              <Button variant="link" onClick={handleSkip} disabled={skipping}>
                {t("skipButton")}
              </Button>
              <Button disabled={workStyle === null} onClick={() => setStep(2)}>
                {t("continueButton")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 flex flex-col gap-4">
            <h1 className="text-body font-semibold">{t("step2.title")}</h1>
            <div className="flex flex-col gap-[10px]">
              <button
                type="button"
                onClick={handleUseDefaultChart}
                disabled={chartBusy}
                className="rounded-item border-border hover:bg-surface-alt flex flex-col gap-1 border p-[14px] text-left disabled:opacity-60"
              >
                <span className="text-control font-semibold">
                  {tSizeCharts("systemChartName.female")}
                </span>
                <span className="text-muted-2 text-ui">
                  {t("step2.defaultOption.subtitle")}
                </span>
              </button>
              <div className="rounded-item border-border flex items-center justify-between gap-2 border border-dashed p-[14px]">
                <button
                  type="button"
                  disabled
                  title={t("step2.importOption.comingSoonTitle")}
                  className="text-placeholder text-control flex-1 text-left font-semibold disabled:cursor-not-allowed"
                >
                  {t("step2.importOption.title")}
                </button>
                <Badge variant="soon">{t("step2.comingSoonBadge")}</Badge>
              </div>
              <div className="rounded-item border-border flex items-center justify-between gap-2 border border-dashed p-[14px]">
                <button
                  type="button"
                  disabled
                  title={t("step2.fillOption.comingSoonTitle")}
                  className="text-placeholder text-control flex-1 text-left font-semibold disabled:cursor-not-allowed"
                >
                  {t("step2.fillOption.title")}
                </button>
                <Badge variant="soon">{t("step2.comingSoonBadge")}</Badge>
              </div>
            </div>
            {chartError && (
              <p role="alert" className="text-alert text-ui">
                {t("step2.chartError")}
              </p>
            )}
            <p className="text-muted text-ui">{t("step2.note")}</p>
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t("backButton")}
              </Button>
              <div className="flex items-center gap-[10px]">
                <Button variant="link" onClick={handleSkip} disabled={skipping}>
                  {t("skipButton")}
                </Button>
                <Button onClick={() => setStep(3)}>
                  {t("continueButton")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 flex flex-col gap-4">
            <h1 className="text-body font-semibold">{t("step3.title")}</h1>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("step3.placeholder")}
              className="bg-surface-alt"
            />
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  size="chrome"
                  className="rounded-pill"
                  onClick={() => setMessage(t(`step3.${key}`))}
                >
                  {t(`step3.${key}`)}
                </Button>
              ))}
            </div>
            <Badge variant="notice" className="w-fit">
              {t("step3.creditsPill", { balance: credits.balance })}
            </Badge>
            {genError && (
              <p role="alert" className="text-alert text-ui">
                {genError}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(2)}
                disabled={submitting}
              >
                {t("backButton")}
              </Button>
              <div className="flex items-center gap-[10px]">
                <Button
                  variant="link"
                  onClick={handleSkip}
                  disabled={skipping || submitting}
                >
                  {t("skipButton")}
                </Button>
                <Button
                  disabled={!message.trim() || submitting}
                  onClick={handleGenerate}
                >
                  {submitting
                    ? t("step3.generatingButton")
                    : t("step3.generateCta", { cost: COSTS.adjust })}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
