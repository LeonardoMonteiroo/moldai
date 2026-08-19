"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternListItem } from "@/lib/api-client";
import { useDashboardStore } from "@/lib/dashboardStore";
import { relativeTime } from "@/lib/format";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export function PatternCard({
  pattern,
  onOpen,
}: {
  pattern: PatternListItem;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("PatternCard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useDashboardStore((s) => s.rename);
  const remove = useDashboardStore((s) => s.remove);

  const handleRename = () => {
    setMenuOpen(false);
    const next = window.prompt(t("renamePrompt"), pattern.name);
    if (next && next.trim() && next.trim() !== pattern.name) {
      rename(pattern.id, next.trim());
    }
  };

  return (
    <div className="border-border rounded-card group relative flex flex-col gap-2 border bg-white p-[10px]">
      <button
        type="button"
        onClick={() => onOpen(pattern.id)}
        className="bg-surface-alt rounded-item flex h-[112px] w-full items-center justify-center overflow-hidden"
      >
        {pattern.garmentType ? (
          <span
            className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: pattern.thumbnailSvg }}
          />
        ) : (
          <span className="text-muted text-[11px]">{t("blankLabel")}</span>
        )}
      </button>
      <div className="flex items-start justify-between gap-1">
        <div className="flex flex-col gap-px">
          <span className="text-[13px] font-semibold">{pattern.name}</span>
          <span className="text-muted text-[11px]">
            {relativeTime(pattern.updatedAt)}
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label={t("menuAriaLabel")}
            onClick={() => setMenuOpen((v) => !v)}
            className="text-muted-2 hover:bg-surface-alt rounded-btn px-[6px] py-[2px] text-[13px] opacity-0 transition-opacity group-hover:opacity-100"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="border-border rounded-card shadow-modal bg-surface absolute top-[26px] right-0 z-10 flex w-[140px] flex-col border py-1">
              <button
                type="button"
                onClick={handleRename}
                className="hover:bg-surface-alt px-3 py-[6px] text-left text-[12px]"
              >
                {t("renameOption")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmingDelete(true);
                }}
                className="text-alert hover:bg-amber-bg px-3 py-[6px] text-left text-[12px]"
              >
                {t("deleteOption")}
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmModal
          title={t("deleteModalTitle")}
          description={t("deleteModalDescription")}
          confirmLabel={t("deleteConfirmButton")}
          cancelLabel={t("deleteCancelButton")}
          onConfirm={() => {
            setConfirmingDelete(false);
            remove(pattern.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
