import { Label, Input } from "moldai-ui";

export const PatternRename = () => (
  <div
    style={{
      maxWidth: 280,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <Label htmlFor="label-rename">Novo nome do molde</Label>
    <Input id="label-rename" defaultValue="Blusa manga longa" />
  </div>
);

export const DisabledEmail = () => (
  <div
    style={{
      maxWidth: 280,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <Label htmlFor="label-email">E-mail</Label>
    <Input id="label-email" defaultValue="ana.silva@email.com" disabled />
  </div>
);

export const PasswordCurrent = () => (
  <div
    style={{
      maxWidth: 280,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <Label htmlFor="label-password">Senha atual</Label>
    <Input id="label-password" type="password" defaultValue="********" />
  </div>
);
