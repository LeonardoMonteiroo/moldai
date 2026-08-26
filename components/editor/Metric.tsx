// A small labelled metric card -- lifted out of CutPlanTab.tsx (its own
// private `Metric`, components/editor/CutPlanTab.tsx:156-174) so Proof3DTab
// can reuse the exact same card rather than a second, driftable copy.
// CutPlanTab.tsx is out of scope for this change (another unit owns it in
// this branch's parallel worktree split) so it still renders its own private
// copy for now; the two are kept byte-for-byte identical on purpose so a
// follow-up can point CutPlanTab at this one with no visual change.
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
