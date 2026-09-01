"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
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
        <Button variant="outline" size="chrome" className="text-muted-2">
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
  exportHref,
  exportTitle,
}: {
  activeTab: EditorTab;
  baseSize: SizeLabel;
  sizes: SizeLabel[];
  detailsOpen: boolean;
  onToggleDetails: () => void;
  hasSelectedPiece: boolean;
  /** `null` while Exportar is disabled -- EDCH-02, moved from Footer.tsx. */
  exportHref: string | null;
  exportTitle?: string;
}) {
  const t = useTranslations("TabBar");
  const tFooter = useTranslations("Footer");
  return (
    // EDCH-01: floating translucent chip over the canvas (Editor.dc.html:453),
    // replacing the old static full-width row -- bg-surface/86 + backdrop-blur
    // reproduce the design's rgba(255,255,255,.86) + blur(6px) on the existing
    // token, the same border/shadow FloatingToolbar/ZoomControls already use.
    <div className="bg-surface/86 border-border rounded-item shadow-card absolute inset-x-4 top-4 z-10 flex items-center gap-2 border p-1 backdrop-blur-sm">
      <TabsList>
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
          size="chrome"
          onClick={onToggleDetails}
          disabled={!hasSelectedPiece}
        >
          {t("pieceDetailsButton")}
          {detailsOpen && <XIcon data-icon="inline-end" />}
        </Button>
      )}
      {exportHref ? (
        <Button variant="outline" size="chrome" asChild>
          <Link href={exportHref}>{tFooter("exportButton")}</Link>
        </Button>
      ) : (
        <Button variant="outline" size="chrome" disabled title={exportTitle}>
          {tFooter("exportButton")}
        </Button>
      )}
    </div>
  );
}
