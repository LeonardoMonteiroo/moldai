import { Tabs, TabsList, TabsTrigger, TabsContent } from "moldai-ui";

// Mirrors components/editor/TabBar.tsx + CanvasArea.tsx: the editor's tab bar
// switches between the 2D pattern, 3D proof, tech sheet and cut plan panels.
export const EditorTabs = () => (
  <Tabs defaultValue="techsheet" style={{ width: 460 }}>
    <TabsList>
      <TabsTrigger value="pattern2d">Molde 2D</TabsTrigger>
      <TabsTrigger value="proof3d">Prova 3D</TabsTrigger>
      <TabsTrigger value="techsheet">Ficha técnica</TabsTrigger>
      <TabsTrigger value="cutplan">Plano de corte</TabsTrigger>
    </TabsList>
    <TabsContent value="pattern2d">
      <div className="text-muted text-ui" style={{ padding: "18px 4px" }}>
        Área do canvas com as peças do molde.
      </div>
    </TabsContent>
    <TabsContent value="proof3d">
      <div className="text-muted text-ui" style={{ padding: "18px 4px" }}>
        Prova 3D ainda não disponível.
      </div>
    </TabsContent>
    <TabsContent value="techsheet">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 4px",
        }}
      >
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            background: "var(--color-surface)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              padding: "9px 12px",
              borderBottom: "1px solid var(--color-line)",
              background: "var(--color-surface-alt)",
            }}
          >
            <span className="text-control" style={{ fontWeight: 600 }}>
              Frente
            </span>
            <span className="text-muted text-ui">1×</span>
          </div>
          <div style={{ padding: "7px 12px" }} className="text-ui">
            Dimensões: 46 × 62 cm
          </div>
          <div style={{ padding: "7px 12px" }} className="text-ui">
            Largura do busto: 92 cm
          </div>
        </div>
        <span className="text-muted text-meta">
          4 peças · base M · unidade cm
        </span>
      </div>
    </TabsContent>
    <TabsContent value="cutplan">
      <div className="text-muted text-ui" style={{ padding: "18px 4px" }}>
        Consumo: 2,4 m · Aproveitamento: 78%
      </div>
    </TabsContent>
  </Tabs>
);

// The `line` variant: an underline-style track, used when the segmented-pill
// look (the default) is heavier than the context calls for.
export const LineVariant = () => (
  <Tabs defaultValue="usage" style={{ width: 360 }}>
    <TabsList variant="line">
      <TabsTrigger value="profile">Perfil</TabsTrigger>
      <TabsTrigger value="usage">Créditos e uso</TabsTrigger>
      <TabsTrigger value="plan">Plano e cobrança</TabsTrigger>
    </TabsList>
    <TabsContent value="profile">
      <div className="text-muted text-ui" style={{ padding: "14px 4px" }}>
        Nome e e-mail da conta.
      </div>
    </TabsContent>
    <TabsContent value="usage">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "14px 4px",
        }}
      >
        <span className="font-display text-display" style={{ fontWeight: 600 }}>
          24
        </span>
        <span className="text-muted text-meta">de 30 · renova em 12 dias</span>
      </div>
    </TabsContent>
    <TabsContent value="plan">
      <div className="text-muted text-ui" style={{ padding: "14px 4px" }}>
        Plano atual: Ateliê.
      </div>
    </TabsContent>
  </Tabs>
);

// Vertical orientation, exercised the same way TabsPrimitive.Root supports it.
export const VerticalOrientation = () => (
  <Tabs
    defaultValue="techsheet"
    orientation="vertical"
    style={{ display: "flex", gap: 12, width: 460 }}
  >
    <TabsList>
      <TabsTrigger value="pattern2d">Molde 2D</TabsTrigger>
      <TabsTrigger value="techsheet">Ficha técnica</TabsTrigger>
      <TabsTrigger value="cutplan">Plano de corte</TabsTrigger>
    </TabsList>
    <TabsContent value="pattern2d">
      <div className="text-muted text-ui" style={{ padding: 4 }}>
        Molde em branco. Descreva a peça no chat para gerar.
      </div>
    </TabsContent>
    <TabsContent value="techsheet">
      <div className="text-muted text-ui" style={{ padding: 4 }}>
        4 peças · base M · unidade cm
      </div>
    </TabsContent>
    <TabsContent value="cutplan">
      <div className="text-muted text-ui" style={{ padding: 4 }}>
        Largura do tecido: 150 cm
      </div>
    </TabsContent>
  </Tabs>
);
