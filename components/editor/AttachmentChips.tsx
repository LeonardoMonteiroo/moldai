const ATTACHMENTS = ["＋ foto", "＋ croqui", "＋ molde .dxf"];

export function AttachmentChips() {
  return (
    <div className="flex items-center gap-[6px] flex-wrap">
      {ATTACHMENTS.map((label) => (
        <button
          key={label}
          type="button"
          disabled
          title="Anexos chegam em breve"
          className="text-[11.5px] px-[10px] py-[5px] rounded-pill border border-dashed border-border text-placeholder cursor-not-allowed"
        >
          {label}
        </button>
      ))}
      <span className="text-[10px] font-semibold uppercase tracking-[.6px] text-olive bg-olive-tint rounded-[5px] px-[6px] py-[2px]">
        em breve
      </span>
    </div>
  );
}
