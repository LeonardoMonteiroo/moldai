const ATTACHMENTS = ["＋ foto", "＋ croqui", "＋ molde .dxf"];

export function AttachmentChips() {
  return (
    <div className="flex gap-[6px]">
      {ATTACHMENTS.map((label) => (
        <button
          key={label}
          type="button"
          title="Upload não disponível neste protótipo"
          className="text-[11.5px] px-[10px] py-[5px] rounded-pill border border-border text-muted-2 hover:bg-surface-alt transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
