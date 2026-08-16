const ATTACHMENTS = ["＋ foto", "＋ croqui", "＋ molde .dxf"];

export function AttachmentChips() {
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {ATTACHMENTS.map((label) => (
        <button
          key={label}
          type="button"
          disabled
          title="Anexos chegam em breve"
          className="rounded-pill border-border text-placeholder cursor-not-allowed border border-dashed px-[10px] py-[5px] text-[11.5px]"
        >
          {label}
        </button>
      ))}
      <span className="text-olive bg-olive-tint rounded-[5px] px-[6px] py-[2px] text-[10px] font-semibold tracking-[.6px] uppercase">
        em breve
      </span>
    </div>
  );
}
