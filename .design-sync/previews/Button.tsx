import { Button } from "moldai-ui";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";

export const Variants = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 24 }}>
    <Button variant="default">Gerar molde</Button>
    <Button variant="outline">Cancelar</Button>
    <Button variant="destructive">Excluir</Button>
    <Button variant="destructiveOutline">Excluir conta</Button>
    <Button variant="secondary">Exportar</Button>
    <Button variant="ghost">Ver detalhes</Button>
    <Button variant="soft">Medidas e grades</Button>
    <Button variant="accent">Peças do molde</Button>
    <Button variant="link">Saiba mais</Button>
  </div>
);

export const Sizes = () => (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 10,
      padding: 24,
    }}
  >
    <Button size="lg">Comprar créditos</Button>
    <Button size="default">Gerar molde</Button>
    <Button size="chrome" variant="outline">
      Cancelar
    </Button>
    <Button size="sm" variant="outline">
      Cancelar
    </Button>
    <Button size="xs" variant="link">
      gerar assim mesmo
    </Button>
    <Button size="icon" variant="ghost" aria-label="Fechar detalhes">
      <XIcon />
    </Button>
    <Button size="icon-sm" variant="ghost" aria-label="Diminuir zoom">
      <MinusIcon />
    </Button>
    <Button size="icon-lg" variant="outline" aria-label="Aumentar zoom">
      <PlusIcon />
    </Button>
  </div>
);

export const ZoomToolbar = () => (
  <div
    className="bg-surface border-border rounded-item shadow-card"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: 7,
      width: "fit-content",
      border: "1px solid",
    }}
  >
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Diminuir zoom"
      className="text-muted-2"
    >
      <MinusIcon />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      aria-label="Ajustar à tela"
      className="text-muted-2 tabular-nums"
      style={{ minWidth: 54 }}
    >
      100%
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Aumentar zoom"
      className="text-muted-2"
    >
      <PlusIcon />
    </Button>
  </div>
);
