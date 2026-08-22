import { Avatar, AvatarBadge, AvatarFallback } from "moldai-ui";

// Real usage: components/shared/PageHeader.tsx's avatar-menu trigger —
// AvatarFallback with initials from the account email (lib/format.ts's
// initialsFromEmail), olive-tint styling, olive border. No AvatarImage in
// the real app: MoldAI never has a user photo, only initials.
export const AccountMenuAvatar = () => (
  <div style={{ display: "flex", gap: 16, padding: 24, alignItems: "center" }}>
    <Avatar
      className="border-olive-border size-[30px] border"
      title="leonardo@moldai.dev"
    >
      <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
        LE
      </AvatarFallback>
    </Avatar>
    <Avatar
      className="border-olive-border size-[30px] border"
      title="atelier@moldai.local"
    >
      <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
        AT
      </AvatarFallback>
    </Avatar>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 14, padding: 24, alignItems: "center" }}>
    <Avatar size="sm">
      <AvatarFallback>LE</AvatarFallback>
    </Avatar>
    <Avatar size="default">
      <AvatarFallback>LE</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>LE</AvatarFallback>
    </Avatar>
  </div>
);

// AvatarBadge is unused in the app today, but it's part of avatar.tsx's
// exported surface and scales off the same group/avatar size context —
// shown here on the account-menu avatar with a small status dot.
export const WithStatusBadge = () => (
  <div style={{ display: "flex", gap: 16, padding: 24, alignItems: "center" }}>
    <Avatar size="lg" className="border-olive-border border">
      <AvatarFallback className="bg-olive-tint text-olive font-semibold">
        LE
      </AvatarFallback>
      <AvatarBadge />
    </Avatar>
    <Avatar className="border-olive-border border">
      <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
        LE
      </AvatarFallback>
      <AvatarBadge />
    </Avatar>
    <Avatar size="sm" className="border-olive-border border">
      <AvatarFallback>LE</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  </div>
);
