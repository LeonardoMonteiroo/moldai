import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "moldai-ui";

// Faithful replica of components/editor/Proof3DTab.tsx — this repo's anchor
// example of the honest-limitations convention: "em breve" work rendered as
// a real empty state rather than a hidden or broken tab. Copy is the
// Proof3DTab catalog namespace verbatim.
export const Proof3DUnavailable = () => (
  <div style={{ padding: 24, minHeight: 220, display: "flex" }}>
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <ellipse cx="12" cy="12" rx="9" ry="4" />
            <ellipse
              cx="12"
              cy="12"
              rx="4"
              ry="9"
              transform="rotate(35 12 12)"
            />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </EmptyMedia>
        <EmptyTitle className="text-control font-semibold">
          Prova 3D ainda não disponível
        </EmptyTitle>
        <EmptyDescription className="max-w-[280px]">
          A visualização 3D do molde vestido no corpo virtual está em
          desenvolvimento.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
);

// Faithful replica of components/editor/CanvasArea.tsx's blank-pattern
// state — no EmptyMedia in the real component, just the header. The editor
// always opens on a blank pattern (CLAUDE.md), so this is the very first
// thing a new pattern's canvas shows.
export const BlankPatternCanvas = () => (
  <div style={{ padding: 24, minHeight: 200, display: "flex" }}>
    <Empty>
      <EmptyHeader>
        <EmptyTitle className="font-display text-muted-2">
          Molde em branco
        </EmptyTitle>
        <EmptyDescription className="max-w-[300px]">
          Descreva a peça que você quer no chat ao lado — a IA gera seu primeiro
          molde do zero.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
);

// Based on components/dashboard/PatternGrid.tsx's isTrulyEmpty state
// (messages/pt-BR.json's PatternGrid.emptyTitle/emptyDescription), extended
// with an EmptyContent CTA reusing the sidebar's real "＋ Novo molde" button
// copy — the real PatternGrid renders this Empty without a CTA (the create
// button already lives in the dashboard sidebar), but EmptyContent's slot is
// exactly for pairing a call-to-action under the message.
export const NoPatternsYet = () => (
  <div style={{ padding: 24, minHeight: 260, display: "flex" }}>
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M8 3.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5Z" />
            <path d="M14 3.5V8h4" />
            <path d="M9 13h6M9 16.5h4" />
          </svg>
        </EmptyMedia>
        <EmptyTitle>Nenhum molde ainda</EmptyTitle>
        <EmptyDescription>
          Crie seu primeiro molde para começar.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="chrome">
          ＋ Novo molde
        </Button>
      </EmptyContent>
    </Empty>
  </div>
);
