import type { ChatMessage } from "@/lib/types";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const HISTORY_WINDOW = 10;

// Renders an ai turn's clarifying questions into its history text so the
// user's next message ("round, short") has visible referents for the model.
function renderMessage(m: ChatMessage): string {
  const questions = (m.questions ?? [])
    .map((q) => `- ${q.label}: ${q.options.join(" | ")}`)
    .join("\n");
  return questions ? `${m.text}\n${questions}` : m.text;
}

// The Messages API requires strictly alternating roles starting with "user".
// The persisted chat can violate both (an API error leaves an orphaned user
// message; the 10-message window can open on an ai message), so normalize:
// merge consecutive same-role turns, drop leading assistant turns.
export function buildHistory(chat: ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const m of chat.slice(-HISTORY_WINDOW)) {
    const role =
      m.author === "user" ? ("user" as const) : ("assistant" as const);
    const content = renderMessage(m);
    if (!content.trim()) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }
  while (turns.length > 0 && turns[0].role === "assistant") turns.shift();
  return turns;
}
