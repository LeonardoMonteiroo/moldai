import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  const t = useTranslations("ZoomControls");
  return (
    <div className="bg-surface border-border rounded-item shadow-card absolute right-5 bottom-5 flex items-center gap-1 border p-[7px]">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("zoomOutTitle")}
        onClick={onZoomOut}
        className="text-muted-2"
      >
        <MinusIcon />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("fitTitle")}
        onClick={onFit}
        className="text-muted-2 min-w-[54px] tabular-nums"
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("zoomInTitle")}
        onClick={onZoomIn}
        className="text-muted-2"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
