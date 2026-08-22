import { Input, Label } from "moldai-ui";

export const PatternRename = () => (
  <div
    style={{
      maxWidth: 300,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <Label htmlFor="input-rename">Novo nome do molde</Label>
    {/* Same 80-char cap the rename dialog's PATCH route enforces. */}
    <Input id="input-rename" defaultValue="Blusa manga longa" maxLength={80} />
  </div>
);

export const SearchToolbar = () => (
  <div
    style={{
      maxWidth: 320,
      padding: 24,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    <span className="text-muted text-ui">12 moldes</span>
    <div style={{ flex: 1 }} />
    <Input placeholder="Buscar molde…" style={{ maxWidth: 180 }} />
  </div>
);

export const ProfileFields = () => (
  <div
    style={{
      maxWidth: 300,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="input-name">Nome</Label>
      <Input id="input-name" defaultValue="Ana Silva" />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="input-email">E-mail</Label>
      <Input id="input-email" defaultValue="ana.silva@email.com" disabled />
    </div>
  </div>
);

export const PasswordInvalid = () => (
  <div
    style={{
      maxWidth: 300,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <Label htmlFor="input-password">Senha atual</Label>
    <Input
      id="input-password"
      type="password"
      defaultValue="12345"
      aria-invalid
    />
    <span className="text-destructive text-ui font-normal">
      Senha atual incorreta.
    </span>
  </div>
);
