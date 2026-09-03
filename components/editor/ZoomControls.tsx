import { MinusIcon, PlusIcon, RulerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FLOAT_CHROME } from "./floatChrome";

/**
 * Editor.dc.html:492-503's bottom-right cluster: zoom out / fit / zoom in,
 * a hairline divider, then the measure toggle.
 *
 * The measure tool lives HERE, not in a toolbar of its own -- the design has
 * no left-hand vertical tool column at all, and putting the ruler back with
 * the other canvas-viewport controls is what that cluster's trailing divider
 * exists for.
 */
export function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
  measureActive,
  onToggleMeasure,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  measureActive: boolean;
  onToggleMeasure: () => void;
}) {
  const t = useTranslations("ZoomControls");
  const tTools = useTranslations("FloatingToolbar");
  return (
    <div
      className={cn(
        FLOAT_CHROME,
        "rounded-btn absolute right-4 bottom-4 z-10 flex h-8 items-center gap-[2px] px-1",
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("zoomOutTitle")}
        title={t("zoomOutTitle")}
        onClick={onZoomOut}
        className="text-muted-2 rounded-chip size-[26px]"
      >
        <MinusIcon />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("fitTitle")}
        title={t("fitTitle")}
        onClick={onFit}
        className="text-muted-2 rounded-chip h-[26px] min-w-[46px] px-0 tabular-nums"
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("zoomInTitle")}
        title={t("zoomInTitle")}
        onClick={onZoomIn}
        className="text-muted-2 rounded-chip size-[26px]"
      >
        <PlusIcon />
      </Button>
      <Separator orientation="vertical" className="mx-[2px] h-4" />
      <Button
        variant={measureActive ? "accent" : "ghost"}
        size="icon-sm"
        aria-label={tTools("measureTool")}
        aria-pressed={measureActive}
        title={tTools("measureTool")}
        onClick={onToggleMeasure}
        className={cn(
          "rounded-chip size-[26px]",
          !measureActive && "text-muted-2",
        )}
      >
        <RulerIcon />
      </Button>
    </div>
  );
}
