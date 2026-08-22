import { Progress } from "moldai-ui";

// Real usage: ChatPanel's composer while a generation is running — a dashed
// step box with the current stage label and a pulsing bar underneath.
export const GenerationStep = () => (
  <div style={{ padding: 24, maxWidth: 360 }}>
    <div
      className="border-disabled-border rounded-item text-muted-2 bg-surface-alt text-ui"
      style={{ border: "1px dashed", padding: 8 }}
    >
      passo 2/4 · pinças
      <Progress
        value={44}
        aria-label="pinças"
        className="bg-track"
        style={{ marginTop: 7, height: 6 }}
      />
    </div>
  </div>
);

export const NearComplete = () => (
  <div style={{ padding: 24, maxWidth: 360 }}>
    <div
      className="border-disabled-border rounded-item text-muted-2 bg-surface-alt text-ui"
      style={{ border: "1px dashed", padding: 8 }}
    >
      passo 4/4 · consumo
      <Progress
        value={92}
        aria-label="consumo"
        className="bg-track"
        style={{ marginTop: 7, height: 6 }}
      />
    </div>
  </div>
);

export const ValueSweep = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 14,
      padding: 24,
      width: 320,
    }}
  >
    <Progress value={20} />
    <Progress value={55} />
    <Progress value={100} />
  </div>
);
