"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * #22: the active section used to render as a plain `<span>` -- unfocusable,
 * skipped by keyboard tabbing, and exposing "current page" through styling
 * alone. It's a real Button now, still visually the olive-tint label, and
 * `aria-current="page"` carries the state programmatically.
 */
function NavItem({
  label,
  isActive,
  onSelect,
}: {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="chrome"
      onClick={onSelect}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "bg-olive-tint text-olive hover:bg-olive-tint hover:text-olive rounded-item h-auto justify-start px-[10px] py-[7px] font-medium"
          : "text-muted-2 justify-start"
      }
    >
      {label}
    </Button>
  );
}

export function Sidebar({
  active,
  onNewPattern,
  disabled,
}: {
  active: "patterns" | "slopers";
  /** Owned by the screen, so its store is the one that records a failure. */
  onNewPattern: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Sidebar");
  const router = useRouter();

  return (
    <div className="border-border bg-surface flex h-full w-[186px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <NavItem
          label={t("myPatternsLabel")}
          isActive={active === "patterns"}
          onSelect={() => router.push("/")}
        />
        {/* /size-charts renders no sidebar, so this entry is never the active one. */}
        <NavItem
          label={t("measurementsLabel")}
          isActive={false}
          onSelect={() => router.push("/size-charts")}
        />
        <NavItem
          label={t("studioBasesLabel")}
          isActive={active === "slopers"}
          onSelect={() => router.push("/slopers")}
        />
        {/* The DXF import first pass (issue #11) shipped in the same commit
            as this wiring — an inert "em breve" card here while a working
            beta exists at /import would be the exact silent-limitation
            failure CLAUDE.md forbids, the inverse of the /slopers rollout
            (disabled+badged until the screen existed, then a real NavItem).
            /import renders no sidebar (the /size-charts precedent just
            above), so this entry is never the active one either. */}
        <NavItem
          label={t("importLabel")}
          isActive={false}
          onSelect={() => router.push("/import")}
        />
      </nav>
      <div className="flex-1" />
      <Button onClick={onNewPattern} disabled={disabled}>
        {t("newPatternButton")}
      </Button>
    </div>
  );
}
