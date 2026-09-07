import { useTranslations } from "next-intl";
import { ChatMessage } from "@/lib/types";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { ClarifyCard } from "./ClarifyCard";

// #257: resolves one diffSpec field path ("type", "gender", "style.<key>",
// "measurementOverrides.<key>") to its pt-BR label -- three catalog lookups,
// never a hand-written label map, reusing the SAME catalogs the generate
// route (specField/styleField) and the size-chart table (measurement)
// already resolve these exact field names through, so a label can never
// drift between the two call sites.
function changedFieldLabel(
  path: string,
  tData: (key: string) => string,
  tMeasurement: (key: string) => string,
): string {
  if (path === "type" || path === "gender") return tData(`specField.${path}`);
  if (path.startsWith("style.")) {
    return tData(`styleField.${path.slice("style.".length)}`);
  }
  if (path.startsWith("measurementOverrides.")) {
    return tMeasurement(
      `measurement.${path.slice("measurementOverrides.".length)}`,
    );
  }
  return path;
}

export function ChatBubble({
  message,
  active = false,
}: {
  message: ChatMessage;
  active?: boolean;
}) {
  const t = useTranslations("ChatBubble");
  const tData = useTranslations("PatternData");
  const tMeasurement = useTranslations("SizeChartTable");

  if (message.author === "user") {
    return (
      <Bubble align="end">
        <BubbleContent>
          {message.text}
          {message.hasImage && (
            // #18: the bytes were never persisted -- this says how many
            // images were used, it is not a thumbnail that would vanish on
            // reload.
            //
            // `hasImage` stays the gate and `imageCount` only supplies the
            // number, so a message persisted before a turn could carry more
            // than one attachment reads as exactly one rather than
            // disappearing. Nothing writes a count without the flag.
            <div className="mt-[9px] flex flex-wrap gap-[6px]">
              {/* Tinted from the bubble's OWN foreground, not bg-surface: this
                  chip sits on the olive user bubble, where a white fill under
                  the bubble's near-white text left the label unreadable. */}
              <span className="rounded-pill text-meta bg-primary-foreground/15 border-primary-foreground/30 border px-2 py-[3px]">
                {t("imagesAttached", { count: message.imageCount ?? 1 })}
              </span>
            </div>
          )}
        </BubbleContent>
      </Bubble>
    );
  }

  if (message.questions && message.questions.length > 0) {
    return (
      <BubbleGroup>
        <Bubble variant="paper">
          <BubbleContent>{message.text}</BubbleContent>
        </Bubble>
        {active ? (
          <ClarifyCard questions={message.questions} />
        ) : (
          // Not a bubble: nobody said this, it is the thread telling you the
          // question is behind you.
          <Marker className="px-[13px] italic">
            <MarkerContent>{t("questionsAnswered")}</MarkerContent>
          </Marker>
        )}
      </BubbleGroup>
    );
  }

  return (
    <Bubble
      variant={
        message.tone === "conflict" || message.tone === "notice"
          ? "notice"
          : "paper"
      }
    >
      <BubbleContent>
        {message.text}
        {message.chips && message.chips.length > 0 && (
          <div className="mt-[9px] flex flex-wrap gap-[6px]">
            {message.chips.map((chip) => (
              <span
                key={chip.label}
                className={[
                  "rounded-pill text-meta border px-2 py-[3px]",
                  chip.tone === "credit"
                    ? "bg-amber-bg border-amber-border text-amber-text"
                    : "bg-surface border-border",
                ].join(" ")}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
        {message.changedFields && message.changedFields.length > 0 && (
          // #257: absent (never an empty array) on the first-ever
          // generation -- see diffSpec's own doc (lib/editor/state.ts) --
          // so this never renders "changed" for every field on a blank
          // pattern's first draft.
          <p className="text-muted text-meta mt-[9px]">
            {t("changedFieldsLabel", {
              fields: message.changedFields
                .map((path) => changedFieldLabel(path, tData, tMeasurement))
                .join(", "),
            })}
          </p>
        )}
        {message.assembly && (
          // #138: the disclaimer is catalog chrome, not model prose (the
          // step text itself is AI-produced and stays outside the pt-BR
          // catalog, exactly like assistantMessage) -- this is what labels
          // it "AI-generated guidance, not verified construction advice."
          <p className="text-muted text-meta mt-[9px]">
            {t("assemblyDisclaimer")}
          </p>
        )}
      </BubbleContent>
    </Bubble>
  );
}
