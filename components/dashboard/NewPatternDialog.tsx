"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileTextIcon, PenLineIcon, UploadIcon } from "lucide-react";
import { NewPatternForm } from "./NewPatternForm";
import type { NewPatternFormInput } from "@/lib/dashboardStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Dashboard.dc.html's "Como você quer começar?" chooser. Every entry point to
 * a new pattern goes through it — the toolbar button, the empty state, and
 * the grid's trailing dashed cell — which is what the design's own
 * `openNewMolde` does from all three.
 *
 * Before this, "+ Novo molde" created a blank pattern and jumped straight to
 * the editor, and importing a .dxf was surfaced in two places the design
 * doesn't have (a sidebar entry and the grid cell) while being absent from
 * the one place it does.
 *
 * All three options are real. The middle one shipped disabled and "em breve"
 * until the two capabilities its richest fields need existed: a molde can
 * now name the size chart it is drafted from, and a generation carries up to
 * MAX_ATTACHMENT_COUNT images rather than exactly one.
 *
 * The form step keeps its own state, so it is mounted once and then hidden
 * rather than unmounted, which is what makes "Voltar" preserve what was
 * already typed. It is mounted lazily, on first entry, so opening the
 * chooser and picking "prompt" never costs a size-chart fetch.
 */
export function NewPatternDialog({
  open,
  onOpenChange,
  onStartFromPrompt,
  creating,
  onSubmitForm,
  submittingForm,
  formErrorCode = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creates the blank pattern and navigates — owned by the caller, which is
   *  the screen that also records a failed create on its own store. */
  onStartFromPrompt: () => void;
  creating: boolean;
  /** Creates and generates from the filled form — owned by the caller, same reason. */
  onSubmitForm: (input: NewPatternFormInput) => void;
  submittingForm: boolean;
  /** Wire code of the last failed form submit, resolved per-code by the form itself. */
  formErrorCode?: string | null;
}) {
  const t = useTranslations("NewPatternDialog");
  const tForm = useTranslations("NewPatternForm");
  const router = useRouter();
  const [step, setStep] = useState<"options" | "form">("options");
  // Mounted once the form step is first opened, and kept mounted from then
  // on: unmounting it would discard everything typed, which is exactly what
  // "Voltar" must not do.
  const [formMounted, setFormMounted] = useState(false);
  const onForm = step === "form";

  function openForm() {
    setFormMounted(true);
    setStep("form");
  }

  return (
    <Dialog
      open={open}
      // A Pattern may already exist by the time a submit is in flight, and
      // dismissing here would orphan it with no id retained. Escape and an
      // overlay click both route through this, so blocking it covers both.
      onOpenChange={(next) => {
        if (submittingForm) return;
        onOpenChange(next);
        if (!next) setStep("options");
      }}
    >
      <DialogContent
        className={onForm ? "sm:max-w-[460px]" : "sm:max-w-[420px]"}
        showCloseButton={!submittingForm}
      >
        <DialogHeader>
          <DialogTitle>{onForm ? tForm("title") : t("title")}</DialogTitle>
          <DialogDescription>
            {onForm ? tForm("subtitle") : t("subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2" hidden={onForm}>
          <Option
            icon={PenLineIcon}
            title={t("promptOption.title")}
            subtitle={t("promptOption.subtitle")}
            disabled={creating}
            onSelect={onStartFromPrompt}
          />
          <Option
            icon={FileTextIcon}
            title={t("formOption.title")}
            subtitle={t("formOption.subtitle")}
            disabled={creating}
            onSelect={openForm}
          />
          {/* UploadIcon, not the design's download glyph: the sidebar's own
              import entry and the size-chart import trigger both already use
              it for this action, and matching the app's other two import
              affordances beats matching one mockup mark. */}
          <Option
            icon={UploadIcon}
            title={t("importOption.title")}
            subtitle={t("importOption.subtitle")}
            onSelect={() => {
              onOpenChange(false);
              router.push("/import");
            }}
          />
        </div>

        {formMounted && (
          <div hidden={!onForm}>
            <NewPatternForm
              onBack={() => setStep("options")}
              onSubmit={onSubmitForm}
              submitting={submittingForm}
              errorCode={formErrorCode}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Option({
  icon: Icon,
  title,
  subtitle,
  onSelect,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  subtitle: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="rounded-btn border-border hover:border-olive hover:bg-olive-tint disabled:hover:border-border flex items-center gap-3 border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span
        className={
          "bg-surface-alt flex size-[34px] flex-none items-center justify-center rounded-full " +
          (disabled ? "text-placeholder" : "")
        }
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span
          className={
            "text-control font-semibold " + (disabled ? "text-placeholder" : "")
          }
        >
          {title}
        </span>
        <span
          className={
            "text-meta " + (disabled ? "text-placeholder" : "text-muted")
          }
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}
