import { EditorTool } from "@/lib/store";

const TOOLS: { id: EditorTool; icon: string; label: string }[] = [
  { id: "cursor", icon: "↖", label: "Cursor (mover e zoom)" },
  { id: "medir", icon: "↔", label: "Medir" },
];

export function FloatingToolbar({
  activeTool,
  onSelect,
}: {
  activeTool: EditorTool;
  onSelect: (tool: EditorTool) => void;
}) {
  return (
    <div className="bg-surface border-border rounded-item shadow-card absolute top-5 left-5 flex flex-col gap-1 border p-[7px]">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={tool.label}
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
