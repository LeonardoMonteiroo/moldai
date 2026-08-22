"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** The active section is a plain label; every other entry navigates. */
function NavItem({
  label,
  isActive,
  onSelect,
}: {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  if (isActive)
    return (
      <span className="bg-olive-tint text-olive rounded-item text-ui px-[10px] py-[7px] font-medium">
        {label}
      </span>
    );
  return (
    <Button
      variant="ghost"
      size="chrome"
      onClick={onSelect}
      className="text-muted-2 justify-start"
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
    <div className="border-border bg-surface flex w-[186px] flex-col border-r p-[14px]">
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
      </nav>
      <div className="flex-1" />
      <div className="border-border rounded-card text-disabled text-meta mb-3 border border-dashed p-[10px] text-center">
        {t("importLabel")}
      </div>
      <Button onClick={onNewPattern} disabled={disabled}>
        {t("newPatternButton")}
      </Button>
    </div>
  );
}
