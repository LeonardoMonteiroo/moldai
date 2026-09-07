"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileTextIcon, ImageIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  prepareImage,
  MAX_ATTACHMENT_COUNT,
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

export function AttachmentChips({
  attachments,
  onChange,
  onPreparingChange,
}: {
  attachments: PreparedAttachment[];
  onChange: (next: PreparedAttachment[]) => void;
  /** Lets the composer block Send while a pick is still decoding, so a
   * message can never go out silently missing the image the user just
   * chose (and the pick can never re-attach itself to a LATER message once
   * it resolves). */
  onPreparingChange?: (preparing: boolean) => void;
}) {
  const t = useTranslations("AttachmentChips");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [errorCode, setErrorCode] = useState<AttachmentErrorCode | null>(null);
  const [truncated, setTruncated] = useState(false);

  // Mirrors the `attachments` prop, but updated synchronously as this pick
  // proceeds -- a multi-file pick awaits prepareImage per file, and the prop
  // itself can change mid-pick (a remove-thumbnail click completing before
  // the next file resolves). Reading through the ref rather than the prop
  // is what makes a removal during an in-flight pick stick instead of being
  // silently overwritten once that pick's next `onChange` fires.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // #274: NewPatternForm.tsx's own pickPhotos, reused rather than reinvented
  // -- at most `room` files are taken (the composer's existing cap, now
  // MAX_ATTACHMENT_COUNT instead of one), a file that fails preparation
  // leaves whatever was already added in place, and the input is cleared so
  // picking the same file twice fires onChange again.
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;
    setErrorCode(null);
    const room = MAX_ATTACHMENT_COUNT - attachments.length;
    const picked = Array.from(files);
    // CLAUDE.md: a limitation is surfaced on-screen, never silently -- the
    // dropped tail otherwise vanished with no trace, indistinguishable from
    // the browser only offering that many files in the first place.
    setTruncated(picked.length > room);
    setPreparing(true);
    onPreparingChange?.(true);
    try {
      for (const file of picked.slice(0, room)) {
        const prepared = await prepareImage(file);
        if ("error" in prepared) {
          setErrorCode(prepared.error);
          continue;
        }
        const next = [...attachmentsRef.current, prepared];
        attachmentsRef.current = next;
        onChange(next);
      }
    } finally {
      setPreparing(false);
      onPreparingChange?.(false);
    }
  }

  const atLimit = attachments.length >= MAX_ATTACHMENT_COUNT;
  const limitLabel = t("photoLimitReached", { max: MAX_ATTACHMENT_COUNT });
  const photoLabel = atLimit ? limitLabel : t("photo");

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      {attachments.length > 0 && (
        // NewPatternForm.tsx's own photo row: a wrapped strip of removable
        // thumbnails, shrunk to fit this composer's 312px column rather than
        // its 64px card-dialog size.
        <div className="flex flex-wrap gap-[6px]">
          {attachments.map((photo, i) => (
            <div
              key={`${photo.base64.slice(0, 24)}-${i}`}
              className="rounded-btn border-border relative size-[40px] overflow-hidden border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- same
                  reasoning as NewPatternForm's photo row: an already-
                  downscaled in-memory JPEG data: URI, nothing for next/image
                  to optimise. */}
              <img
                src={`data:${photo.mediaType};base64,${photo.base64}`}
                alt=""
                className="size-full object-cover"
              />
              <Button
                variant="secondary"
                size="icon-xs"
                className="absolute top-0 right-0 size-4 [&_svg]:size-[10px]"
                aria-label={t("removeAttachment")}
                title={t("removeAttachment")}
                onClick={() => {
                  const next = attachments.filter((_, j) => j !== i);
                  attachmentsRef.current = next;
                  onChange(next);
                }}
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-[6px]">
        {/* One image picker, not two: the "croqui" button opened the
            identical IMAGE_ACCEPT dialog as this one -- a sketch IS a photo
            as far as the attachment pipeline is concerned (prepareImage
            treats both the same way), so the second button offered a
            distinction the app never made. No `capture` hint either: an
            existing sketch on disk is as likely as a camera shot. `multiple`
            lets one dialog pick several of the (up to MAX_ATTACHMENT_COUNT)
            remaining slots at once, same as NewPatternForm's file input. */}
        <input
          ref={photoInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void pick(e)}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={photoLabel}
          title={photoLabel}
          className={ICON_BUTTON}
          disabled={preparing || atLimit}
          onClick={() => photoInputRef.current?.click()}
        >
          <ImageIcon />
        </Button>
        {/* Still disabled, still explained -- the "em breve" wording moved
            from a visible badge into this control's own name/tooltip, and
            the dashed edge keeps it visibly unavailable rather than merely
            inert. */}
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
        {preparing && (
          <span className="text-muted-2 text-meta">{t("preparing")}</span>
        )}
        {errorCode && (
          <span role="alert" className="text-alert text-meta">
            {t(`errors.${errorCode}`)}
          </span>
        )}
        {truncated && (
          <span role="alert" className="text-alert text-meta">
            {limitLabel}
          </span>
        )}
      </div>
    </div>
  );
}
