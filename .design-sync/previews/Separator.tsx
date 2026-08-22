import { Separator } from "moldai-ui";

export const HeaderDivider = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: 24,
      background: "var(--color-surface)",
    }}
  >
    <span className="font-display text-title" style={{ fontWeight: 600 }}>
      MoldAI
    </span>
    <Separator orientation="vertical" className="h-5" />
    <span className="text-title" style={{ fontWeight: 600 }}>
      Blusa manga longa
    </span>
    <div style={{ flex: 1 }} />
    <span className="text-meta text-muted">v3 · há 2 min</span>
  </div>
);

export const SizePickerPanel = () => (
  <div
    style={{
      width: 232,
      padding: 8,
      borderRadius: 10,
      border: "1px solid var(--color-border)",
      background: "var(--color-surface)",
      boxShadow: "var(--shadow-card)",
    }}
  >
    <div style={{ display: "flex", gap: 5, padding: "0 4px 8px" }}>
      {["PP", "P", "M", "G", "GG"].map((size) => (
        <span
          key={size}
          className="text-meta"
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            border: "1px solid var(--color-border)",
            background: size === "M" ? "var(--color-olive)" : "transparent",
            color: size === "M" ? "var(--color-primary-foreground)" : undefined,
          }}
        >
          {size}
        </span>
      ))}
    </div>
    <Separator />
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "8px 4px 0",
      }}
    >
      <span
        className="text-meta"
        style={{
          padding: "2px 7px",
          borderRadius: 999,
          background: "var(--color-surface-alt)",
          width: "fit-content",
        }}
      >
        em breve
      </span>
      <span className="text-meta text-muted" style={{ lineHeight: 1.3 }}>
        Trocar o tamanho-base sem regerar
      </span>
    </div>
  </div>
);

export const AccountMenu = () => (
  <div
    style={{
      width: 240,
      padding: 6,
      borderRadius: 10,
      border: "1px solid var(--color-border)",
      background: "var(--color-surface)",
      boxShadow: "var(--shadow-card)",
    }}
  >
    <div className="text-meta text-muted" style={{ padding: "6px 10px" }}>
      leonardo@ateliedaana.com.br
    </div>
    <Separator className="my-1" />
    <div style={{ display: "flex", flexDirection: "column" }}>
      {["Créditos e uso", "Plano e cobrança", "Preferências"].map((label) => (
        <span key={label} className="text-ui" style={{ padding: "6px 10px" }}>
          {label}
        </span>
      ))}
    </div>
    <Separator className="my-1" />
    <span className="text-ui" style={{ padding: "6px 10px", display: "block" }}>
      Sair
    </span>
  </div>
);
