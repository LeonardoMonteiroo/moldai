import { useTranslations } from "next-intl";
import { EditorTool } from "@/lib/store";

const TOOLS: { id: EditorTool; icon: string; labelKey: string }[] = [
  { id: "cursor", icon: "↖", labelKey: "cursorTool" },
  { id: "measure", icon: "↔", labelKey: "measureTool" },
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
    <div className="bg-surface border-border rounded-item shadow-card absolute top-5 left-5 flex flex-col gap-1 border p-[7px]">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={t(tool.labelKey)}
          onClick={() => onSelect(tool.id)}
          className={[
            "flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[14px] transition-colors",
            tool.id === activeTool
              ? "bg-olive-tint text-olive"
              : "text-muted-2 hover:bg-surface-alt",
          ].join(" ")}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}
