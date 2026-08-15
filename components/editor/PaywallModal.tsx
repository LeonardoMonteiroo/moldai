"use client";

import { useEditorStore } from "@/lib/store";

export function PaywallModal() {
  const paywall = useEditorStore((s) => s.paywall);
  const credits = useEditorStore((s) => s.credits);
  const purchase = useEditorStore((s) => s.purchase);
  const close = useEditorStore((s) => s.closePaywall);

  if (!paywall.open || !credits) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center pt-[52px]">
      <div className="absolute inset-0 bg-overlay" onClick={close} />
      <div className="relative w-[470px] bg-surface border border-border rounded-modal p-[22px] flex flex-col gap-[13px] shadow-modal">
        <div className="flex items-center gap-[9px]">
          <span className="w-[26px] h-[26px] rounded-full bg-amber-bg border border-amber-border text-amber-text text-[12px] flex items-center justify-center">
            ◆
          </span>
          <span className="font-display text-[21px] font-semibold tracking-[-0.4px]">
            Seus créditos acabaram
          </span>
        </div>
        <p className="text-[13.5px] leading-[1.55] text-muted-2 m-0">
          {paywall.actionLabel.charAt(0).toUpperCase() + paywall.actionLabel.slice(1)} usa{" "}
          {paywall.required} créditos e você tem {paywall.balance}. Nada foi perdido — o molde
          continua salvo.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => purchase("topup")}
            className="flex-1 text-left border border-border rounded-card p-[14px] flex flex-col gap-[5px] bg-surface-alt hover:bg-white transition-colors"
          >
            <span className="text-[13px] font-semibold">Créditos avulsos</span>
            <span className="font-display text-[21px] font-semibold">R$ 19</span>
            <span className="text-[11.5px] text-muted">100 créditos · sem assinatura</span>
            <div className="flex-1 min-h-2" />
            <span className="text-[12px] font-semibold text-olive">Comprar ›</span>
          </button>
          <button
            onClick={() => purchase("subscribe")}
            className="flex-1 text-left border-2 border-olive rounded-card p-[14px] flex flex-col gap-[5px] bg-olive-tint hover:brightness-[0.98] transition-[filter]"
          >
            <div className="flex items-center gap-[7px]">
              <span className="text-[13px] font-semibold">Ateliê</span>
              <span className="text-[10.5px] font-semibold px-[7px] py-[2px] rounded-pill bg-amber-bg border border-amber-border text-amber-text">
                melhor custo
              </span>
            </div>
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display text-[21px] font-semibold">R$ 59</span>
              <span className="text-[12px] text-muted-2">/mês</span>
            </div>
            <span className="text-[11.5px] text-olive">500 créditos/mês · renova todo dia 1</span>
            <div className="flex-1 min-h-2" />
            <span className="text-[12px] font-semibold text-olive-dark">Assinar ›</span>
          </button>
        </div>
        <div className="flex items-center gap-3 pt-[3px]">
          <span className="text-[12px] text-muted">
            Seus créditos grátis renovam em {credits.renewsInDays} dias.
          </span>
          <div className="flex-1" />
          <button
            onClick={close}
            className="text-[12.5px] font-medium text-muted-2 underline"
          >
            Voltar ao molde
          </button>
        </div>
      </div>
    </div>
  );
}
