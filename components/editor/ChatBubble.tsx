import { ChatMessage } from "@/lib/types";

export function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.author === "user") {
    return (
      <div className="self-end max-w-[88%] bg-olive text-[#f7f7f2] text-[13px] leading-[1.45] px-[13px] py-[10px] rounded-[12px_12px_3px_12px]">
        {message.text}
      </div>
    );
  }

  const isConflict = message.tone === "conflict";

  return (
    <div
      className={[
        "max-w-[92%] text-[13px] leading-[1.45] px-[13px] py-[10px] rounded-[12px_12px_12px_3px] border",
        isConflict
          ? "bg-amber-bg border-amber-border text-amber-text"
          : "bg-paper border-border",
      ].join(" ")}
    >
      {message.text}
      {message.chips && message.chips.length > 0 && (
        <div className="flex gap-[6px] mt-[9px] flex-wrap">
          {message.chips.map((chip) => (
            <span
              key={chip.label}
              className={[
                "text-[11px] px-2 py-[3px] rounded-pill border",
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
