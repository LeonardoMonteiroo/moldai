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
    <div className="absolute left-5 top-5 bg-surface border border-border rounded-item p-[7px] flex flex-col gap-1 shadow-card">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={tool.label}
          onClick={() => onSelect(tool.id)}
          className={[
            "w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-[14px] transition-colors",
            tool.id === activeTool ? "bg-olive-tint text-olive" : "text-muted-2 hover:bg-surface-alt",
          ].join(" ")}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}
