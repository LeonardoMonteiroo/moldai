import { MousePointer2Icon, RulerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EditorTool } from "@/lib/store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const TOOLS: {
  id: EditorTool;
  Icon: typeof MousePointer2Icon;
  labelKey: string;
}[] = [
  { id: "cursor", Icon: MousePointer2Icon, labelKey: "cursorTool" },
  { id: "measure", Icon: RulerIcon, labelKey: "measureTool" },
];

export function FloatingToolbar({
  activeTool,
  onSelect,
}: {
  activeTool: EditorTool;
  onSelect: (tool: EditorTool) => void;
}) {
  const t = useTranslations("FloatingToolbar");
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      orientation="vertical"
      value={activeTool}
      aria-label={t("cursorTool")}
      onValueChange={(value) => {
        if (value) onSelect(value as EditorTool);
      }}
      className="bg-surface border-border rounded-item shadow-card flex-col border p-[7px]"
    >
      {TOOLS.map(({ id, Icon, labelKey }) => (
        <ToggleGroupItem key={id} value={id} aria-label={t(labelKey)}>
          <Icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
