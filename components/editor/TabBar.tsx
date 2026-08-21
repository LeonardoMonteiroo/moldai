"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
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
}: {
  activeTab: EditorTab;
  baseSize: SizeLabel;
  sizes: SizeLabel[];
  detailsOpen: boolean;
  onToggleDetails: () => void;
  hasSelectedPiece: boolean;
}) {
  const t = useTranslations("TabBar");
  return (
    <div className="bg-surface border-border flex items-center gap-2 border-b px-4 py-[11px]">
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
    </div>
  );
}
