"use client";

import { ChevronDownIcon, PanelRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EditorTab } from "@/lib/store";
import { SizeLabel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FLOAT_CHROME, FLOAT_CHROME_EDGE } from "./floatChrome";

const TAB_IDS: EditorTab[] = ["pattern2d", "proof3d", "techsheet", "cutplan"];

const TAB_LABEL_KEYS: Record<EditorTab, string> = {
  pattern2d: "tabPattern2d",
  proof3d: "tabProof3d",
  techsheet: "tabTechsheet",
  cutplan: "tabCutplan",
};

function SizeSelector({
  baseSize,
  sizes,
}: {
  baseSize: SizeLabel;
  sizes: SizeLabel[];
}) {
  const t = useTranslations("TabBar");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="chrome"
          className={cn(FLOAT_CHROME, "rounded-btn text-muted-2 h-8")}
        >
          {t("sizeButton", { size: baseSize })}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[232px] p-2">
        <div className="flex gap-[5px] px-1 pb-2">
          {sizes.map((size) => (
            <Badge
              key={size}
              variant={size === baseSize ? "accent" : "quiet"}
              size="chip"
            >
              {size}
            </Badge>
          ))}
        </div>
        <Separator />
        <div className="flex flex-col items-start gap-[5px] px-1 pt-2">
          <Badge variant="soon">{t("comingSoonBadge")}</Badge>
          <span className="text-muted text-meta leading-tight">
            {t("sizeChangeNote")}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TabBar({
  activeTab,
  baseSize,
  sizes,
  detailsOpen,
  onToggleDetails,
  hasSelectedPiece,
  onExport,
  exportDisabled,
  exportTitle,
}: {
  activeTab: EditorTab;
  baseSize: SizeLabel;
  sizes: SizeLabel[];
  detailsOpen: boolean;
  onToggleDetails: () => void;
  hasSelectedPiece: boolean;
  /** Opens ExportModal -- EDCH-02 moved this from Footer.tsx as a Link to the
   *  dedicated /export screen; it now opens the in-editor modal instead
   *  (Editor.dc.html's own "Exportar"). */
  onExport: () => void;
  exportDisabled: boolean;
  exportTitle?: string;
}) {
  const t = useTranslations("TabBar");
  const tFooter = useTranslations("Footer");
  return (
    // EDCH-01 / Editor.dc.html:452: a TRANSPARENT positioning row, not a bar.
    // Each control below carries the design's own `.float-chrome` chip
    // styling individually, so the canvas grid shows through between them --
    // this row used to be one full-width translucent bar, which read as a
    // solid white strip across the top of the canvas.
    <div className="absolute inset-x-4 top-4 z-10 flex items-center gap-1">
      <TabsList className={cn(FLOAT_CHROME, "rounded-btn h-8")}>
        {TAB_IDS.map((id) => (
          <TabsTrigger key={id} value={id}>
            {t(TAB_LABEL_KEYS[id])}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex-1" />
      <SizeSelector baseSize={baseSize} sizes={sizes} />
      {activeTab === "pattern2d" && (
        <Button
          variant={detailsOpen ? "accent" : "outline"}
          size="icon-sm"
          onClick={onToggleDetails}
          disabled={!hasSelectedPiece}
          aria-label={t("pieceDetailsButton")}
          aria-pressed={detailsOpen}
          title={t("pieceDetailsButton")}
          className={cn(
            // Only the resting (unpressed) chip is translucent white; the
            // pressed one keeps `accent`'s own fill.
            detailsOpen ? FLOAT_CHROME_EDGE : FLOAT_CHROME,
            "rounded-btn h-8 w-[30px]",
          )}
        >
          <PanelRightIcon />
        </Button>
      )}
      {/* Prova 3D exports nothing -- Editor.dc.html hides the button on that
          tab entirely rather than showing a permanently-disabled one. */}
      {activeTab !== "proof3d" && (
        <Button
          size="chrome"
          onClick={onExport}
          disabled={exportDisabled}
          title={exportTitle}
          // Solid olive per Editor.dc.html:474 (`background: var(--color-olive)`)
          // -- it was an outline button, which lost the design's one clear
          // primary action on the canvas.
          className={cn(FLOAT_CHROME_EDGE, "rounded-btn h-8")}
        >
          {tFooter("exportButton")}
        </Button>
      )}
    </div>
  );
}
