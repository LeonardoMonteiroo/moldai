import { Badge } from "moldai-ui";

export const Variants = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 24 }}>
    <Badge variant="default">Blusa</Badge>
    <Badge variant="secondary">v3</Badge>
    <Badge variant="destructive">Erro</Badge>
    <Badge variant="outline">PP</Badge>
    <Badge variant="ghost">Filtro</Badge>
    <Badge variant="accent">M</Badge>
    <Badge variant="notice">melhor custo</Badge>
    <Badge variant="quiet">GG</Badge>
    <Badge variant="soon">em breve</Badge>
    <Badge variant="link" asChild>
      <button type="button">Ver detalhes</button>
    </Badge>
  </div>
);

export const SizePills = () => (
  <div style={{ display: "flex", gap: 6, padding: 24 }}>
    <Badge variant="quiet" size="chip">
      PP
    </Badge>
    <Badge variant="quiet" size="chip">
      P
    </Badge>
    <Badge variant="accent" size="chip">
      M
    </Badge>
    <Badge variant="quiet" size="chip">
      G
    </Badge>
    <Badge variant="quiet" size="chip">
      GG
    </Badge>
    <Badge variant="soon" size="chip">
      em breve
    </Badge>
  </div>
);

export const PlanBadge = () => (
  <div style={{ display: "flex", gap: 8, padding: 24, alignItems: "center" }}>
    <span style={{ fontSize: 21, fontWeight: 600 }}>Ateliê</span>
    <Badge variant="notice">melhor custo</Badge>
  </div>
);
