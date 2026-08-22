import { Marker, MarkerContent, MarkerIcon } from "moldai-ui";

// Faithful replica of components/editor/ChatBubble.tsx: once a clarifying
// question has been answered, the thread doesn't render another bubble
// ("nobody said this, it is the thread telling you the question is behind
// you") — it renders this italic Marker divider instead. Real copy from the
// ChatBubble catalog namespace.
export const QuestionsAnswered = () => (
  <div style={{ padding: 24, maxWidth: 320 }}>
    <Marker className="px-[13px] italic">
      <MarkerContent>Perguntas respondidas.</MarkerContent>
    </Marker>
  </div>
);

// The `separator` variant (before/after hairlines) fits a day divider inside
// ChatPanel's message log — the thread is a role="log" region (CLAUDE.md's
// audible-core-flow convention), and grouping turns by day is the natural
// next use once a conversation spans more than one session.
export const DayDivider = () => (
  <div style={{ padding: 24, maxWidth: 320 }}>
    <Marker variant="separator">
      <MarkerContent>Hoje</MarkerContent>
    </Marker>
  </div>
);

// The `border` variant (bottom hairline) suits an eyebrow-style section
// label — components/editor/PieceDetailsPanel.tsx already has this exact
// role ("sectionLabel": "Peça selecionada", rendered as a plain uppercase
// span today); this shows the same real copy composed through Marker with
// an icon, as the panel could read once it needs one.
export const PieceSectionLabel = () => (
  <div style={{ padding: 24, maxWidth: 320 }}>
    <Marker
      variant="border"
      className="text-meta tracking-eyebrow font-semibold uppercase"
    >
      <MarkerIcon>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 4h9l7 7-9 9-7-7Z" />
          <circle cx="9.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </MarkerIcon>
      <MarkerContent>Peça selecionada</MarkerContent>
    </Marker>
  </div>
);
