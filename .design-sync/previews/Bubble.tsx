import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "moldai-ui";

// Mirrors components/editor/ChatBubble.tsx: the user's turn (default, olive,
// right-aligned) followed by the AI's reply (paper, left-aligned).
export const Exchange = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: 24,
      maxWidth: 420,
    }}
  >
    <Bubble variant="default" align="end">
      <BubbleContent>
        Preciso de uma blusa manga longa, gola V, tamanho M
      </BubbleContent>
    </Bubble>
    <Bubble variant="paper" align="start">
      <BubbleContent>
        Pronto! Gerei o molde com base nas medidas M da grade ativa (Feminino
        adulto · ABNT).
      </BubbleContent>
    </Bubble>
  </div>
);

// The seam-conflict warning: a real chat turn gets tone "conflict", which
// ChatBubble maps to the amber `notice` variant — deliberately not
// `destructive`, which is the separate red-alert token.
export const ConflictNotice = () => (
  <div style={{ padding: 24, maxWidth: 420 }}>
    <Bubble variant="notice" align="start">
      <BubbleContent>
        A cava do corpo ficou 2,4 cm mais funda que a cava da manga depois do
        ajuste. O molde foi gerado mesmo assim — corrija a manga ou ignore o
        aviso.
      </BubbleContent>
    </Bubble>
  </div>
);

// A failed generation, from ChatPanel.tsx's generationStatus === "error"
// branch — the same amber notice bubble, with role="alert" on the real one.
export const GenerationErrorNotice = () => (
  <div style={{ padding: 24, maxWidth: 420 }}>
    <Bubble variant="notice" align="start">
      <BubbleContent role="alert">
        A geração falhou. Seus créditos foram devolvidos — tente novamente.
      </BubbleContent>
    </Bubble>
  </div>
);

// A clarifying-question turn: the AI's paper bubble followed by a `surface`
// bubble holding controls, per ChatBubble.tsx's BubbleGroup + ClarifyCard
// pairing (the clarify card itself is a separate component; this stands in
// with its own option list to show the surface variant holding controls).
export const ClarifyingQuestion = () => (
  <div style={{ padding: 24, maxWidth: 420 }}>
    <BubbleGroup>
      <Bubble variant="paper" align="start">
        <BubbleContent>
          Só para confirmar: é uma manga longa justa ou com folga?
        </BubbleContent>
      </Bubble>
      <Bubble variant="surface" align="start">
        <BubbleContent>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              className="text-meta text-muted tracking-eyebrow"
              style={{ fontWeight: 600, textTransform: "uppercase" }}
            >
              Caimento da manga
            </span>
            {["Justa", "Com folga"].map((option) => (
              <button
                key={option}
                type="button"
                className="border-border text-ui"
                style={{
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </BubbleContent>
      </Bubble>
    </BubbleGroup>
  </div>
);

// The remaining variants (outline, ghost, destructive) plus reactions —
// outline/ghost aren't used in the chat thread today but are real tokens on
// the shared primitive; destructive is the red-alert sibling `notice`
// deliberately avoids for non-destructive warnings.
export const OtherVariants = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: 24,
      maxWidth: 420,
    }}
  >
    <Bubble variant="outline" align="start">
      <BubbleContent>Peça salva como base do ateliê (em breve).</BubbleContent>
    </Bubble>
    <Bubble variant="ghost" align="start">
      <BubbleContent>Perguntas respondidas.</BubbleContent>
    </Bubble>
    <Bubble variant="destructive" align="start">
      <BubbleContent>
        Não foi possível excluir a conta: senha incorreta.
      </BubbleContent>
    </Bubble>
    <div style={{ position: "relative", width: "fit-content" }}>
      <Bubble variant="paper" align="start">
        <BubbleContent>Ajustei a pinça do busto em 1,2 cm.</BubbleContent>
      </Bubble>
      <BubbleReactions>
        <span className="text-ui">✓</span>
      </BubbleReactions>
    </div>
  </div>
);
