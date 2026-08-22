import { ToggleGroup, ToggleGroupItem } from "moldai-ui";
import { MousePointer2Icon, RulerIcon } from "lucide-react";

// Real usage: CutPlanTab's fabric-width picker.
export const FabricWidth = () => (
  <div style={{ padding: 24 }}>
    <ToggleGroup
      type="single"
      variant="outline"
      value="150"
      aria-label="Largura do tecido"
    >
      <ToggleGroupItem value="140">1,40 m</ToggleGroupItem>
      <ToggleGroupItem value="150">1,50 m</ToggleGroupItem>
      <ToggleGroupItem value="160">1,60 m</ToggleGroupItem>
    </ToggleGroup>
  </div>
);

// Real usage: FloatingToolbar's vertical cursor/measure tool switch, floating
// over the pattern canvas.
export const CanvasTools = () => (
  <div
    className="bg-surface border-border rounded-item shadow-card"
    style={{
      display: "inline-flex",
      border: "1px solid",
      padding: 7,
      width: "fit-content",
    }}
  >
    <ToggleGroup
      type="single"
      variant="outline"
      orientation="vertical"
      value="cursor"
      aria-label="Cursor (mover e zoom)"
      style={{ flexDirection: "column" }}
    >
      <ToggleGroupItem value="cursor" aria-label="Cursor (mover e zoom)">
        <MousePointer2Icon />
      </ToggleGroupItem>
      <ToggleGroupItem value="measure" aria-label="Medir">
        <RulerIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  </div>
);

// Real usage: ClarifyCard's single-choice question inside the AI chat bubble.
export const ClarifyOptions = () => (
  <div style={{ padding: 24, maxWidth: 360 }}>
    <div
      className="text-ink text-ui"
      style={{ fontWeight: 600, marginBottom: 7 }}
    >
      Que tipo de manga você quer?
    </div>
    <ToggleGroup
      type="single"
      variant="outline"
      value="Manga longa"
      aria-label="Que tipo de manga você quer?"
      className="flex-wrap"
    >
      <ToggleGroupItem value="Manga curta">Manga curta</ToggleGroupItem>
      <ToggleGroupItem value="Manga longa">Manga longa</ToggleGroupItem>
      <ToggleGroupItem value="Sem manga">Sem manga</ToggleGroupItem>
      <ToggleGroupItem value="__other__">outro</ToggleGroupItem>
    </ToggleGroup>
  </div>
);
