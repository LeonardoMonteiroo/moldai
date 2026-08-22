import { Textarea, Button } from "moldai-ui";

export const ChatComposer = () => (
  <div
    style={{
      maxWidth: 340,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    {/* Mirrors components/editor/MessageInput.tsx: describing a garment is
        the app's primary interaction, so it's a textarea, not an input. */}
    <Textarea
      placeholder="Descreva o ajuste…"
      rows={2}
      className="bg-surface-alt max-h-[160px] min-h-0 resize-none py-[11px]"
    />
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Button className="h-auto flex-1 py-[11px]">Gerar</Button>
      <span className="text-muted text-ui">1 crédito</span>
    </div>
  </div>
);

export const GarmentDescription = () => (
  <div style={{ maxWidth: 340, padding: 24 }}>
    {/* field-sizing-content grows the box with real multi-line content
        instead of scrolling it sideways. */}
    <Textarea
      defaultValue="blusa feminina, manga longa, gola V, pence, comprimento 60 cm"
      rows={2}
      className="bg-surface-alt max-h-[160px] min-h-0 resize-none py-[11px]"
    />
  </div>
);

export const DisabledComposer = () => (
  <div style={{ maxWidth: 340, padding: 24 }}>
    <Textarea
      defaultValue="ajustando a manga…"
      disabled
      rows={2}
      className="bg-surface-alt max-h-[160px] min-h-0 resize-none py-[11px]"
    />
  </div>
);
