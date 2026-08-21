import { useTranslations } from "next-intl";
import { ChatMessage } from "@/lib/types";
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
      <div className="bg-olive text-olive-foreground text-control max-w-[88%] self-end rounded-[12px_12px_3px_12px] px-[13px] py-[10px] leading-[1.45]">
        {message.text}
      </div>
    );
  }

  if (message.questions && message.questions.length > 0) {
    return (
      <div className="flex flex-col gap-[8px]">
        <div className="bg-paper border-border text-control max-w-[92%] rounded-[12px_12px_12px_3px] border px-[13px] py-[10px] leading-[1.45]">
          {message.text}
        </div>
        {active ? (
          <ClarifyCard questions={message.questions} />
        ) : (
          <div className="text-muted text-ui max-w-[92%] px-[13px] italic">
            {t("questionsAnswered")}
          </div>
        )}
      </div>
    );
  }

  const isConflict = message.tone === "conflict";

  return (
    <div
      className={[
        "text-control max-w-[92%] rounded-[12px_12px_12px_3px] border px-[13px] py-[10px] leading-[1.45]",
        isConflict
          ? "bg-amber-bg border-amber-border text-amber-text"
          : "bg-paper border-border",
      ].join(" ")}
    >
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
    </div>
  );
}
