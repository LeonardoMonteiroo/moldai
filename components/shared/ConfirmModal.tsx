"use client";

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center pt-[52px]">
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        className="bg-overlay absolute inset-0 cursor-default border-0"
      />
      <div className="bg-surface border-border rounded-modal shadow-modal relative flex w-[380px] flex-col gap-3 border p-[20px]">
        <span className="font-display text-[17px] font-semibold">{title}</span>
        <p className="text-muted-2 m-0 text-[13px] leading-[1.5]">
          {description}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="border-border rounded-btn text-muted-2 hover:bg-surface-alt border px-[13px] py-[7px] text-[12px] font-medium transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="border-alert text-alert hover:bg-amber-bg rounded-btn border px-[13px] py-[7px] text-[12px] font-medium transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
