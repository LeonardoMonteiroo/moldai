"use client";

import { useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SloperListItem } from "@/lib/types";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
import { useSlopersStore } from "@/lib/slopersStore";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Badge } from "@/components/ui/badge";
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

export function SloperCard({
  sloper,
  onUse,
}: {
  sloper: SloperListItem;
  onUse: (id: string) => void;
}) {
  const t = useTranslations("SloperCard");
  const tGarment = useTranslations("TechSheetTab");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(sloper.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useSlopersStore((s) => s.rename);
  const remove = useSlopersStore((s) => s.remove);

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    const next = draftName.trim();
    if (next && next !== sloper.name) rename(sloper.id, next);
    setRenaming(false);
  };

  return (
    <div className="border-border rounded-card group bg-surface relative flex flex-col gap-2 border p-[10px]">
      <div className="bg-surface-alt rounded-item relative flex h-[112px] w-full items-center justify-center overflow-hidden">
        <span
          aria-hidden="true"
          className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: sloper.thumbnailSvg }}
        />
        <Badge variant="quiet" size="chip" className="absolute top-2 left-2">
          {tGarment(`garmentType.${sloper.garmentType}`)}
        </Badge>
      </div>
      <div className="flex items-start justify-between gap-1">
        {/* min-w-0 so `truncate` has something to shrink against instead of
            pushing the "⋯" menu off the tile. */}
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-control truncate font-semibold">
            {sloper.name}
          </span>
          <span className="text-muted text-meta">
            {t("meta", {
              garment: tGarment(`garmentType.${sloper.garmentType}`),
              baseSize: sloper.baseSize,
            })}
          </span>
          {/* Absent on a base saved before patterns carried a chart name --
              omitted rather than guessed, like the tech sheet's row. */}
          {sloper.sizeChartName && (
            <span className="text-muted text-meta truncate">
              {sloper.sizeChartName}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
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
                  setDraftName(sloper.name);
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

      <Button size="sm" onClick={() => onUse(sloper.id)}>
        {t("useButton")}
      </Button>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>{t("renameTitle")}</DialogTitle>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor={`rename-sloper-${sloper.id}`}>
                {t("renamePrompt")}
              </FieldLabel>
              <Input
                id={`rename-sloper-${sloper.id}`}
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
            remove(sloper.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
