import { ScrollArea } from "moldai-ui";

// Mirrors components/dashboard/PatternGrid.tsx: a scrollable list of pattern
// cards, cut short enough here that it actually overflows the fixed height.
const patterns = [
  { name: "Blusa manga longa", type: "Blusa", updated: "há 2 min · v3" },
  { name: "Vestido midi evasê", type: "Vestido", updated: "há 1 h · v5" },
  { name: "Saia lápis", type: "Saia", updated: "ontem · v2" },
  { name: "Camiseta básica", type: "Camiseta", updated: "há 3 dias · v1" },
  { name: "Blusa gola V", type: "Blusa", updated: "há 5 dias · v4" },
  { name: "Vestido festa longo", type: "Vestido", updated: "há 1 semana · v2" },
  { name: "Saia plissada", type: "Saia", updated: "há 2 semanas · v1" },
];

export const PatternList = () => (
  <ScrollArea
    style={{ height: 220, width: 280 }}
    className="border-border rounded-card border"
  >
    <div
      style={{ display: "flex", flexDirection: "column", padding: 8, gap: 4 }}
    >
      {patterns.map((p) => (
        <div
          key={p.name}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "8px 10px",
            borderRadius: 8,
          }}
        >
          <span className="text-control" style={{ fontWeight: 600 }}>
            {p.name}
          </span>
          <span className="text-meta text-muted">
            {p.type} · {p.updated}
          </span>
        </div>
      ))}
    </div>
  </ScrollArea>
);

// Mirrors components/settings/UsageSection.tsx's ledger history list.
const ledger = [
  { label: "Uso · Ajuste", when: "há 10 min", amount: "−2", credit: false },
  { label: "Uso · Graduação", when: "há 2 h", amount: "−6", credit: false },
  { label: "Créditos avulsos", when: "ontem", amount: "+100", credit: true },
  { label: "Uso · Ajuste", when: "há 2 dias", amount: "−2", credit: false },
  { label: "Estorno", when: "há 3 dias", amount: "+4", credit: true },
  { label: "Renovação", when: "há 12 dias", amount: "+30", credit: true },
  { label: "Uso · Pergunta", when: "há 12 dias", amount: "−2", credit: false },
];

export const LedgerHistory = () => (
  <ScrollArea
    style={{ height: 220, width: 320 }}
    className="border-border bg-surface rounded-card border"
  >
    <div
      style={{ display: "flex", flexDirection: "column", padding: "4px 14px" }}
    >
      {ledger.map((entry, i) => (
        <div
          key={i}
          className="border-line"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0",
            borderBottom:
              i === ledger.length - 1 ? "none" : "1px solid var(--color-line)",
          }}
        >
          <span className="text-ui">{entry.label}</span>
          <span
            className="text-ui"
            style={{
              color: entry.credit
                ? "var(--color-olive-dark)"
                : "var(--color-alert)",
              fontWeight: 500,
            }}
          >
            {entry.amount}
          </span>
        </div>
      ))}
    </div>
  </ScrollArea>
);

// `fill` mode: a full-height two-column layout, the shape SizeChartsShell
// uses so its panels stay full-height inside the scroll region instead of
// collapsing to their content size.
export const FillTwoColumn = () => (
  <ScrollArea
    fill
    style={{ height: 220, width: 380 }}
    className="border-border rounded-card border"
  >
    <div style={{ display: "flex", minHeight: "100%", gap: 1 }}>
      <div
        className="bg-surface"
        style={{
          width: 160,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span
          className="text-meta text-muted tracking-eyebrow"
          style={{ textTransform: "uppercase", fontWeight: 600 }}
        >
          Grades
        </span>
        <span className="text-ui" style={{ fontWeight: 600 }}>
          Feminino adulto · ABNT
        </span>
        <span className="text-ui text-muted">Masculino adulto</span>
      </div>
      <div
        className="bg-paper"
        style={{
          flex: 1,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <span className="text-ui text-muted">
          Selecione uma grade para editar.
        </span>
      </div>
    </div>
  </ScrollArea>
);
