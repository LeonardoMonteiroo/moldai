import { NextResponse } from "next/server";
import { addMessage, bumpVersion, getState, setConflict } from "@/lib/mock-data";

export async function POST(request: Request) {
  const { action } = (await request.json()) as { action: "fix" | "ignore" };

  if (action === "fix") {
    setConflict(null);
    bumpVersion();
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: "Cava da frente e da manga ajustadas juntas.",
      chips: [{ label: "correção gratuita", tone: "neutral" }],
      createdAt: Date.now(),
    });
  } else {
    setConflict(null);
  }

  return NextResponse.json({ status: "ok", state: getState() });
}
