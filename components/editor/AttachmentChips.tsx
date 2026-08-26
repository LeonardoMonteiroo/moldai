"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  prepareImage,
  type AttachmentErrorCode,
  type PreparedAttachment,
} from "@/lib/editor/attachment";

// #18: photo/sketch are real controls now -- only the .dxf import stays a
// dashed, disabled placeholder (its own follow-up issue, dependent on the
// DXF parser).
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

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
  const sketchInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {attachment ? (
        <span className="rounded-pill border-border bg-surface-alt text-ui flex max-w-full items-center gap-[6px] border py-[3px] pr-[3px] pl-[10px]">
          <span className="max-w-[160px] truncate" title={attachment.file.name}>
            {attachment.status === "preparing"
              ? t("preparing")
              : attachment.file.name}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("removeAttachment")}
            onClick={() => onChange(null)}
          >
            <XIcon />
          </Button>
        </span>
      ) : (
        <>
          <input
            ref={photoInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            capture="environment"
            className="hidden"
            onChange={pick}
          />
          <input
            ref={sketchInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={pick}
          />
          <Button
            variant="outline"
            size="chrome"
            className="rounded-pill"
            onClick={() => photoInputRef.current?.click()}
          >
            {t("photo")}
          </Button>
          <Button
            variant="outline"
            size="chrome"
            className="rounded-pill"
            onClick={() => sketchInputRef.current?.click()}
          >
            {t("sketch")}
          </Button>
        </>
      )}

      {attachment?.status === "error" && (
        <span role="alert" className="text-alert text-meta">
          {t(`errors.${attachment.errorCode}`)}
        </span>
      )}

      <Button
        variant="outline"
        size="chrome"
        disabled
        title={t("dxfComingSoonTitle")}
        className="rounded-pill text-placeholder border-dashed"
      >
        {t("dxf")}
      </Button>
      <Badge variant="soon">{t("comingSoonBadge")}</Badge>
    </div>
  );
}
