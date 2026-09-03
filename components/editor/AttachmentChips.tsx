"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { FileTextIcon, ImageIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  prepareImage,
  type AttachmentErrorCode,
  type PreparedAttachment,
} from "@/lib/editor/attachment";

// #18: attaching an image is a real control -- only the .dxf import stays a
// disabled placeholder (its own follow-up issue, dependent on the DXF
// parser).
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

// Editor.dc.html:206-214: 26x26 icon buttons on the composer's own bottom
// row, not labelled pills above it. They lost their visible "+ foto" text in
// that move, so the accessible name now comes from aria-label/title -- which
// is also where the .dxf button's "em breve" explanation lives, since the
// design's composer row has no room for the badge that used to carry it.
const ICON_BUTTON = "rounded-chip text-muted-2 size-[26px] [&_svg]:size-[14px]";

export interface AttachmentSelection {
  file: File;
  status: "preparing" | "ready" | "error";
  prepared?: PreparedAttachment;
  errorCode?: AttachmentErrorCode;
}

export function AttachmentChips({
  attachment,
  onChange,
}: {
  attachment: AttachmentSelection | null;
  onChange: (next: AttachmentSelection | null) => void;
}) {
  const t = useTranslations("AttachmentChips");
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    onChange({ file, status: "preparing" });
    const result = await prepareImage(file);
    if ("error" in result) {
      onChange({ file, status: "error", errorCode: result.error });
      return;
    }
    onChange({ file, status: "ready", prepared: result });
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  if (attachment) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-[6px]">
        <span className="rounded-pill border-border bg-surface-alt text-ui flex min-w-0 items-center gap-[6px] border py-[3px] pr-[3px] pl-[10px]">
          <span className="max-w-[140px] truncate" title={attachment.file.name}>
            {attachment.status === "preparing"
              ? t("preparing")
              : attachment.file.name}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("removeAttachment")}
            title={t("removeAttachment")}
            onClick={() => onChange(null)}
          >
            <XIcon />
          </Button>
        </span>
        {attachment.status === "error" && (
          <span role="alert" className="text-alert text-meta">
            {t(`errors.${attachment.errorCode}`)}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {/* One image picker, not two: the "croqui" button opened the identical
          IMAGE_ACCEPT dialog as this one -- a sketch IS a photo as far as the
          attachment pipeline is concerned (prepareImage treats both the same
          way), so the second button offered a distinction the app never made.
          No `capture` hint either: an existing sketch on disk is as likely as
          a camera shot. */}
      <input
        ref={photoInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={pick}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("photo")}
        title={t("photo")}
        className={ICON_BUTTON}
        onClick={() => photoInputRef.current?.click()}
      >
        <ImageIcon />
      </Button>
      {/* Still disabled, still explained -- the "em breve" wording moved from
          a visible badge into this control's own name/tooltip, and the dashed
          edge keeps it visibly unavailable rather than merely inert. */}
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label={t("dxfComingSoonTitle")}
        title={t("dxfComingSoonTitle")}
        className={`${ICON_BUTTON} border-disabled-border text-placeholder border border-dashed`}
      >
        <FileTextIcon />
      </Button>
    </>
  );
}
