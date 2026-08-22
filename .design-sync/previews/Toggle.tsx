import { Toggle } from "moldai-ui";
import { RulerIcon } from "lucide-react";

export const States = () => (
  <div style={{ display: "flex", gap: 10, padding: 24 }}>
    <Toggle aria-label="Medir" pressed>
      <RulerIcon />
      Medir
    </Toggle>
    <Toggle aria-label="Medir" pressed={false}>
      <RulerIcon />
      Medir
    </Toggle>
  </div>
);

export const OutlineVariant = () => (
  <div style={{ display: "flex", gap: 10, padding: 24 }}>
    <Toggle variant="outline" aria-label="Mostrar grade" pressed>
      Mostrar grade
    </Toggle>
    <Toggle variant="outline" aria-label="Mostrar grade" pressed={false}>
      Mostrar grade
    </Toggle>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24 }}>
    <Toggle size="sm" variant="outline" pressed aria-label="PP">
      PP
    </Toggle>
    <Toggle size="default" variant="outline" pressed aria-label="M">
      M
    </Toggle>
    <Toggle size="lg" variant="outline" pressed aria-label="GG">
      GG
    </Toggle>
  </div>
);
