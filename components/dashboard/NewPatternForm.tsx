"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { PlusIcon, XIcon } from "lucide-react";
import {
  TYPES,
  NECKLINES,
  SLEEVES,
  CUFFS,
  COLLARS,
  FRONT_CLOSURES,
  SKIRTS,
  WAISTBANDS,
  FIT_CLASSES,
} from "@/lib/draft/garment";
import {
  formStyleFieldsFor,
  STYLE_FIELDS_BY_TYPE,
  type FormStyleField,
} from "@/lib/draft/formFields";
import {
  prepareImage,
  MAX_ATTACHMENT_COUNT,
  type PreparedAttachment,
  type AttachmentErrorCode,
} from "@/lib/editor/attachment";
import type { NewPatternFormInput } from "@/lib/dashboardStore";
import * as api from "@/lib/api-client";
import type { GarmentSpec, GarmentStyle, GarmentType } from "@/lib/types";
import type { SizeChartListEntry, SleeveLength } from "@/lib/types";
import {
  COSTS,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_PATTERN_NAME_LENGTH,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Dashboard.dc.html's "Preencher formulário" step — the second step of the
 * new-pattern chooser, rendered inside the same dialog.
 *
 * Everything the user picks here travels twice: as a readable pt-BR line in
 * the pattern's own chat (composed below), and as a structured `formSpec` the
 * route re-applies over whatever the model returns. The second copy is what
 * makes "the choice I made is the choice that gets drafted" hold even when
 * the model ignores the prompt.
 *
 * State is plain `useState` and lives in this component rather than the
 * dialog, which is what makes "Voltar" preserve what was already typed: the
 * dialog switches steps around this component instead of unmounting it.
 *
 * Three foreign namespaces, each a single-source reuse rather than a second
 * copy of the same display text: `TechSheetTab` owns the five garment-type
 * labels (the `PatternGrid` precedent), `AttachmentChips` owns the
 * per-`AttachmentErrorCode` messages and the photo row's labels, and
 * `MessageInput` owns the credit-count plural.
 */

/** Radix cannot hold an empty string as a select value, so "the user left this to the AI" needs a real sentinel. It is never sent. */
const AUTO = "auto";

/**
 * The option list per style field, keyed off the same exported enums the
 * prompt and the tool schema render from — never a second hardcoded copy, so
 * a new member reaches this form for free. Client components already import
 * these directly (`PatternGrid`, `SloperGrid`).
 */
const STYLE_OPTIONS: Record<FormStyleField, readonly string[]> = {
  neckline: NECKLINES,
  sleeve: SLEEVES,
  cuff: CUFFS,
  collar: COLLARS,
  frontClosure: FRONT_CLOSURES,
  skirt: SKIRTS,
  waistband: WAISTBANDS,
  fit: FIT_CLASSES,
};

/** Codes with their own message; anything else resolves to the generic one. */
const KNOWN_ERRORS = [
  "insufficient_credits",
  "create_failed",
  "rate_limited",
  "message_too_long",
];

export function NewPatternForm({
  onBack,
  onSubmit,
  submitting,
  errorCode = null,
}: {
  onBack: () => void;
  onSubmit: (input: NewPatternFormInput) => void;
  submitting: boolean;
  /** Wire code of the last failed submit, or null. Resolved per-code here because the dashboard's shared notice renders one fixed sentence and sits behind this dialog anyway. */
  errorCode?: string | null;
}) {
  const t = useTranslations("NewPatternForm");
  const tGarment = useTranslations("TechSheetTab");
  const tAttach = useTranslations("AttachmentChips");
  const tCredit = useTranslations("MessageInput");

  const [name, setName] = useState("");
  const [type, setType] = useState<GarmentType>("blouse");
  const [style, setStyle] = useState<Partial<Record<FormStyleField, string>>>(
    {},
  );
  const [sizeChartId, setSizeChartId] = useState<string | null>(null);
  const [charts, setCharts] = useState<SizeChartListEntry[] | null>(null);
  const [chartsFailed, setChartsFailed] = useState(false);
  const [photos, setPhotos] = useState<PreparedAttachment[]>([]);
  const [photoError, setPhotoError] = useState<AttachmentErrorCode | null>(
    null,
  );
  const [details, setDetails] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api
      .listSizeCharts()
      .then((list) => {
        if (!live) return;
        setCharts(list);
        // The account's own active chart is the honest default: it is what a
        // prompt-started molde would have used.
        setSizeChartId((list.find((c) => c.isActive) ?? list[0])?.id ?? null);
      })
      .catch(() => {
        if (!live) return;
        // Never blocks submission -- an absent id means "use the account's
        // active chart", which is the same thing the server would pick.
        setChartsFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // The controls to actually render, which is also the set that gets sent:
  // `cuff` drops out unless the sleeve is long, because no drafter reads it
  // otherwise.
  const fields = formStyleFieldsFor(
    type,
    style.sleeve as SleeveLength | undefined,
  );

  function changeType(next: string) {
    const nextType = next as GarmentType;
    setType(nextType);
    // A value the new type does not apply would otherwise still be sent as an
    // explicit choice the user can no longer see or undo.
    const applicable = new Set<string>(STYLE_FIELDS_BY_TYPE[nextType]);
    setStyle((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([field]) => applicable.has(field)),
      ),
    );
  }

  async function pickPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError(null);
    const room = MAX_ATTACHMENT_COUNT - photos.length;
    for (const file of Array.from(files).slice(0, room)) {
      const prepared = await prepareImage(file);
      if ("error" in prepared) {
        // Already-added photos are left in place: one unusable file is not a
        // reason to discard work the user already did.
        setPhotoError(prepared.error);
        continue;
      }
      setPhotos((prev) => [...prev, prepared]);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  const chosen = fields.filter(
    (f) => style[f] !== undefined && style[f] !== AUTO,
  );
  // The line the chat log shows, and the prefix the route length-checks. Also
  // needed at render time so the details field can reserve room for it.
  const head = [
    tGarment(`garmentType.${type}`),
    ...chosen.map((f) => `${t(`field.${f}`)}: ${t(`value.${f}.${style[f]}`)}`),
  ].join(" · ");
  // The composed message is the head, a blank line, then the details, so
  // capping details at the full ceiling would let the field accept a submit
  // the route then rejects with message_too_long -- after a create round
  // trip, and with no retry that could ever succeed. The cap belongs where
  // the field is. The 2 is the blank line between the two parts.
  const detailsMax = Math.max(0, MAX_CHAT_MESSAGE_LENGTH - head.length - 2);

  function submit() {
    // Cast once, here: `style` is keyed by FormStyleField, every one of which
    // formFields.ts proves at compile time to be an optional GarmentStyle key,
    // but that proof does not survive an index write.
    const styleOut = Object.fromEntries(
      chosen.map((f) => [f, style[f]]),
    ) as GarmentStyle;
    const formSpec: GarmentSpec = {
      type,
      // The form has no measurement fields. Left empty so the merge keeps
      // whatever the model extracted from the details text.
      measurementOverrides: {},
      style: styleOut,
    };
    const trimmed = details.trim();
    onSubmit({
      name: name.trim(),
      message: trimmed ? `${head}\n\n${trimmed}` : head,
      formSpec,
      sizeChartId,
      images: photos,
    });
  }

  const errorMessage = errorCode
    ? t(`errors.${KNOWN_ERRORS.includes(errorCode) ? errorCode : "fallback"}`)
    : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-[14px]">
        <Field>
          <FieldLabel htmlFor="nm-name">{t("field.name")}</FieldLabel>
          <FieldContent>
            <Input
              id="nm-name"
              value={name}
              maxLength={MAX_PATTERN_NAME_LENGTH}
              placeholder={t("namePlaceholder")}
              disabled={submitting}
              onChange={(e) => setName(e.target.value)}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="nm-type">{t("field.type")}</FieldLabel>
          <FieldContent>
            <Select
              value={type}
              onValueChange={changeType}
              disabled={submitting}
            >
              <SelectTrigger id="nm-type" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TYPES.map((gt) => (
                    <SelectItem key={gt} value={gt}>
                      {tGarment(`garmentType.${gt}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="nm-grade">{t("field.sizeChart")}</FieldLabel>
          <FieldContent>
            <Select
              value={sizeChartId ?? undefined}
              onValueChange={setSizeChartId}
              disabled={submitting || chartsFailed || !charts}
            >
              <SelectTrigger
                id="nm-grade"
                size="sm"
                className="w-full"
                aria-describedby="nm-grade-note"
              >
                <SelectValue placeholder={t("chartLoading")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(charts ?? []).map((chart) => (
                    <SelectItem key={chart.id} value={chart.id}>
                      {chart.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {/* The chart carries the gender the block is drafted from, so the
                control decides more than its label says -- the same gap the
                size-chart library closed when its "ativa" badge was rewritten
                to state its scope. */}
            <FieldDescription id="nm-grade-note">
              {chartsFailed ? t("chartLoadFailed") : t("chartGenderNote")}
            </FieldDescription>
          </FieldContent>
        </Field>

        {fields.map((field) => (
          <Field key={field}>
            <FieldLabel htmlFor={`nm-style-${field}`}>
              {t(`field.${field}`)}
            </FieldLabel>
            <FieldContent>
              <Select
                value={style[field] ?? AUTO}
                onValueChange={(value) =>
                  setStyle((prev) => ({ ...prev, [field]: value }))
                }
                disabled={submitting}
              >
                <SelectTrigger
                  id={`nm-style-${field}`}
                  size="sm"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {/* Default, and never sent: a concrete value here would
                        force a choice the user never made, and validateSpec
                        already tells `undefined` apart from a value. */}
                    <SelectItem value={AUTO}>{t("styleAuto")}</SelectItem>
                    {STYLE_OPTIONS[field].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`value.${field}.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        ))}

        {/* A group, not a labelled control: there is no single input to point
            a FieldLabel's htmlFor at, and a <label> associated with nothing
            is inert markup. */}
        <Field role="group" aria-labelledby="nm-photos-label">
          <FieldTitle id="nm-photos-label">{t("field.photos")}</FieldTitle>
          <FieldContent>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <div
                  key={`${photo.base64.slice(0, 24)}-${i}`}
                  className="rounded-btn border-border relative size-[64px] overflow-hidden border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                      data: URI of an already-downscaled in-memory JPEG; there
                      is no remote asset for next/image to optimise. */}
                  <img
                    src={`data:${photo.mediaType};base64,${photo.base64}`}
                    alt=""
                    className="size-full object-cover"
                  />
                  <Button
                    variant="secondary"
                    size="icon-xs"
                    className="absolute top-[2px] right-[2px]"
                    aria-label={tAttach("removeAttachment")}
                    title={tAttach("removeAttachment")}
                    disabled={submitting}
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              {photos.length < MAX_ATTACHMENT_COUNT && (
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={submitting}
                  aria-label={t("addPhoto")}
                  title={t("addPhoto")}
                  className="text-muted size-[64px] flex-none border-dashed"
                >
                  <PlusIcon aria-hidden />
                </Button>
              )}
              {/* Driven by the button above, which is the control that
                  carries the accessible name. Deliberately WITHOUT an
                  aria-label of its own, unlike FileSummaryCard's chooser: at
                  display:none this element is outside the accessibility tree
                  entirely, so a name on it reaches nobody and would only
                  collide with the button's in a by-label lookup. */}
              <input
                ref={fileInput}
                data-slot="photo-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={submitting}
                onChange={(e) => void pickPhotos(e.target.files)}
              />
            </div>
            <FieldDescription>
              {t("photoLimitNote", { max: MAX_ATTACHMENT_COUNT })}
            </FieldDescription>
            {photoError && (
              <span role="alert" className="text-alert text-meta">
                {tAttach(`errors.${photoError}`)}
              </span>
            )}
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="nm-desc">{t("field.details")}</FieldLabel>
          <FieldContent>
            <Textarea
              id="nm-desc"
              value={details}
              maxLength={detailsMax}
              placeholder={t("detailsPlaceholder")}
              disabled={submitting}
              onChange={(e) => setDetails(e.target.value)}
            />
          </FieldContent>
        </Field>
      </div>

      {errorMessage && (
        // Amber `notice`, not the red alert token: a failed mutation on a
        // screen that is otherwise fine. The link is what makes the store's
        // pendingPatternId retry reachable -- without it, naming the blocker
        // is a dead end. VerificationPanel pairs the identical code with the
        // identical link.
        <p role="alert" className="text-amber-text text-ui">
          {errorMessage}
          {errorCode === "insufficient_credits" && (
            <>
              {" "}
              <Link href="/settings?section=plan" className="underline">
                {t("buyCreditsLink")}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {/* The real charge, stated where the paying action is -- the same rule
            /import's own "Importar molde" button follows. */}
        <span className="text-muted text-meta mr-auto">
          {tCredit("creditCost", { cost: COSTS.adjust })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={submitting}
        >
          {t("back")}
        </Button>
        <Button size="sm" onClick={submit} disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </div>
  );
}
