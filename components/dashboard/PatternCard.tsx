"use client";

import { useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PatternListItem } from "@/lib/api-client";
import { useDashboardStore } from "@/lib/dashboardStore";
import { relativeTime } from "@/lib/format";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

export function PatternCard({
  pattern,
  onOpen,
}: {
  pattern: PatternListItem;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("PatternCard");
  const tf = useTranslations("Format");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(pattern.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useDashboardStore((s) => s.rename);
  const remove = useDashboardStore((s) => s.remove);

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    const next = draftName.trim();
    if (next && next !== pattern.name) rename(pattern.id, next);
    setRenaming(false);
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
          <span className="text-muted text-meta">{t("blankLabel")}</span>
        )}
      </button>
      <div className="flex items-start justify-between gap-1">
        {/* min-w-0 so the name can actually shrink inside the flex row --
            without it `truncate` has nothing to truncate against and a long
            name pushes the "⋯" menu off the tile. */}
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-control truncate font-semibold">
            {pattern.name}
          </span>
          <span className="text-muted text-meta">
            {relativeTime(tf, pattern.updatedAt)}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Revealed on hover, but also on keyboard focus — otherwise the menu
                is unreachable without a pointer. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("menuAriaLabel")}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px]">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => {
                  setDraftName(pattern.name);
                  setRenaming(true);
                }}
              >
                {t("renameOption")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmingDelete(true)}
              >
                {t("deleteOption")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>{t("renameTitle")}</DialogTitle>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor={`rename-${pattern.id}`}>
                {t("renamePrompt")}
              </FieldLabel>
              {/* Same cap the PATCH route enforces, so the field stops you
                  here instead of failing after a round trip. */}
              <Input
                id={`rename-${pattern.id}`}
                value={draftName}
                maxLength={MAX_PATTERN_NAME_LENGTH}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenaming(false)}
              >
                {t("renameCancelButton")}
              </Button>
              <Button type="submit" size="sm" disabled={!draftName.trim()}>
                {t("renameSaveButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
