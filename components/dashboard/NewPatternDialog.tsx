"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileTextIcon, PenLineIcon, UploadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
 * The middle option is deliberately disabled + "em breve" rather than hidden
 * or faked: the design's form asks for a per-pattern size chart and several
 * photos, and neither exists. A pattern snapshots the ACCOUNT's active chart
 * at its first generation (there is no per-pattern selection), and
 * `POST /api/patterns/[id]/generate` accepts exactly one image. Shipping a
 * form whose two richest fields silently did nothing is the failure mode
 * CLAUDE.md's "surface feature limitations on-screen" rule exists to prevent.
 */
export function NewPatternDialog({
  open,
  onOpenChange,
  onStartFromPrompt,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creates the blank pattern and navigates — owned by the caller, which is
   *  the screen that also records a failed create on its own store. */
  onStartFromPrompt: () => void;
  creating: boolean;
}) {
  const t = useTranslations("NewPatternDialog");
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
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
            disabled
            reason={t("formOption.comingSoonTitle")}
            badge={t("comingSoonBadge")}
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
  reason,
  badge,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  subtitle: string;
  onSelect?: () => void;
  disabled?: boolean;
  reason?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={reason}
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
      {badge && (
        <Badge variant="soon" className="ml-auto flex-none">
          {badge}
        </Badge>
      )}
    </button>
  );
}
