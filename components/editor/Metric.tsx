// A small labelled metric card -- originally lifted out of CutPlanTab.tsx's
// own private `Metric` so Proof3DTab could reuse the exact same card rather
// than a second, driftable copy. CutPlanTab.tsx now imports this one too
// (#10 follow-up) -- its private copy, kept byte-for-byte identical in the
// meantime, is gone.
export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border-border rounded-card bg-surface flex min-w-[150px] flex-col gap-1 border p-[14px]">
      <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
        {label}
      </span>
      <span className="font-display text-title font-semibold">{value}</span>
      <span className="text-muted text-tick">{hint}</span>
    </div>
  );
}
