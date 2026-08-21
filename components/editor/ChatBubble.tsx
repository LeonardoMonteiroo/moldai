import { useTranslations } from "next-intl";
import { ChatMessage } from "@/lib/types";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { ClarifyCard } from "./ClarifyCard";

export function ChatBubble({
  message,
  active = false,
}: {
  message: ChatMessage;
  active?: boolean;
}) {
  const t = useTranslations("ChatBubble");

  if (message.author === "user") {
    return (
      <Bubble align="end">
        <BubbleContent>{message.text}</BubbleContent>
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
      </BubbleContent>
    </Bubble>
  );
}
