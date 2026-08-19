// Framework-free (no "use client") so app/settings/page.tsx (a Server
// Component) can import SETTINGS_SECTIONS as plain data — a client
// component's exports become opaque client references when imported
// server-side, which breaks array/const values (only components/functions
// are meant to cross that boundary).
export type SettingsSection =
  "profile" | "password" | "danger" | "usage" | "plan";

export const SETTINGS_SECTIONS: SettingsSection[] = [
  "profile",
  "password",
  "danger",
  "usage",
  "plan",
];
