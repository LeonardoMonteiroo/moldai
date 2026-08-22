import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "moldai-ui";

// AvatarGroup has no call site in the app yet (MoldAI is single-account,
// personal-use for the MVP), but the billing plans already scale toward
// multi-seat ateliês ("Estúdio", "Confecção" — messages/pt-BR.json's
// PlanSection.plans), so a "quem trabalhou nesse molde" roster is a
// plausible next surface for it. Initials reuse the same olive-tint /
// amber-bg / surface-alt fallback tokens PageHeader's account avatar uses.
export const AtelierTeam = () => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 8, padding: 24 }}
  >
    <AvatarGroup>
      <Avatar>
        <AvatarFallback className="bg-olive-tint text-olive font-semibold">
          LE
        </AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-amber-bg text-amber-text font-semibold">
          MP
        </AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-surface-alt text-muted-2 font-semibold">
          RS
        </AvatarFallback>
      </Avatar>
    </AvatarGroup>
    <span className="text-meta text-muted-foreground">
      Equipe do ateliê · 3 pessoas
    </span>
  </div>
);

export const WithOverflowCount = () => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 8, padding: 24 }}
  >
    <AvatarGroup>
      <Avatar size="sm">
        <AvatarFallback className="bg-olive-tint text-olive font-semibold">
          LE
        </AvatarFallback>
      </Avatar>
      <Avatar size="sm">
        <AvatarFallback className="bg-amber-bg text-amber-text font-semibold">
          MP
        </AvatarFallback>
      </Avatar>
      <Avatar size="sm">
        <AvatarFallback className="bg-surface-alt text-muted-2 font-semibold">
          RS
        </AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
    <span className="text-meta text-muted-foreground">
      6 pessoas com acesso à Confecção
    </span>
  </div>
);
