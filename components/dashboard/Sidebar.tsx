"use client";

import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Folder, Ruler, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * #22: the active section used to render as a plain `<span>` -- unfocusable,
 * skipped by keyboard tabbing, and exposing "current page" through styling
 * alone. It's a real Button now, still visually the olive-tint label, and
 * `aria-current="page"` carries the state programmatically.
 *
 * Icon matches Dashboard.dc.html's own per-item lucide SVGs (Folder/Ruler/
 * Layers) -- size-[15px] to match its `width="15" height="15"` exactly,
 * rather than the type scale's icon-sizing rule, which has no 15px step.
 */
function NavItem({
  label,
  icon: Icon,
  isActive,
  onSelect,
}: {
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
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
          ? "bg-olive-tint text-olive hover:bg-olive-tint hover:text-olive rounded-item h-auto justify-start gap-[9px] px-[10px] py-[7px] font-medium"
          : "text-muted-2 justify-start gap-[9px]"
      }
    >
      <Icon className="size-[15px]" aria-hidden />
      {label}
    </Button>
  );
}

export function Sidebar({
  active,
}: {
  active: "patterns" | "slopers" | "size-charts";
}) {
  const t = useTranslations("Sidebar");
  const router = useRouter();

  return (
    <div className="border-border bg-surface flex h-full w-[200px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <NavItem
          label={t("myPatternsLabel")}
          icon={Folder}
          isActive={active === "patterns"}
          onSelect={() => router.push("/")}
        />
        <NavItem
          label={t("measurementsLabel")}
          icon={Ruler}
          isActive={active === "size-charts"}
          onSelect={() => router.push("/size-charts")}
        />
        <NavItem
          label={t("studioBasesLabel")}
          icon={Layers}
          isActive={active === "slopers"}
          onSelect={() => router.push("/slopers")}
        />
        {/* No import entry: Dashboard.dc.html's sidebar is these three
            sections only, and importing a .dxf is a way to START a pattern,
            not a section of the app — it belongs in NewPatternDialog's
            chooser, which is where the design puts it and where it now lives.
            This entry (issue #11) predated that chooser, when the grid card
            was still an inert "em breve" placeholder and the sidebar was the
            only real way in; that reason is gone. /import stays reachable
            from the chooser and from the onboarding checklist's step 4, so
            nothing is hidden — it is just no longer claiming to be a
            top-level destination. */}
      </nav>
    </div>
  );
}
