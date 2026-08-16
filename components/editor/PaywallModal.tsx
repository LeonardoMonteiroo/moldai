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
      <button
        type="button"
        aria-label="Fechar"
        onClick={close}
        className="bg-overlay absolute inset-0 cursor-default border-0"
      />
      <div className="bg-surface border-border rounded-modal shadow-modal relative flex w-[470px] flex-col gap-[13px] border p-[22px]">
        <div className="flex items-center gap-[9px]">
          <span className="bg-amber-bg border-amber-border text-amber-text flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[12px]">
            ◆
          </span>
          <span className="font-display text-[21px] font-semibold tracking-[-0.4px]">
            Seus créditos acabaram
          </span>
        </div>
        <p className="text-muted-2 m-0 text-[13.5px] leading-[1.55]">
          {paywall.actionLabel.charAt(0).toUpperCase() +
            paywall.actionLabel.slice(1)}{" "}
          usa {paywall.required} créditos e você tem {paywall.balance}. Nada foi
          perdido — o molde continua salvo.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => purchase("topup")}
            className="border-border rounded-card bg-surface-alt flex flex-1 flex-col gap-[5px] border p-[14px] text-left transition-colors hover:bg-white"
          >
            <span className="text-[13px] font-semibold">Créditos avulsos</span>
            <span className="font-display text-[21px] font-semibold">
              R$ 19
            </span>
            <span className="text-muted text-[11.5px]">
              100 créditos · sem assinatura
            </span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive text-[12px] font-semibold">
              Comprar ›
            </span>
          </button>
          <button
            onClick={() => purchase("subscribe")}
            className="border-olive rounded-card bg-olive-tint flex flex-1 flex-col gap-[5px] border-2 p-[14px] text-left transition-[filter] hover:brightness-[0.98]"
          >
            <div className="flex items-center gap-[7px]">
              <span className="text-[13px] font-semibold">Ateliê</span>
              <span className="rounded-pill bg-amber-bg border-amber-border text-amber-text border px-[7px] py-[2px] text-[10.5px] font-semibold">
                melhor custo
              </span>
            </div>
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display text-[21px] font-semibold">
                R$ 59
              </span>
              <span className="text-muted-2 text-[12px]">/mês</span>
            </div>
            <span className="text-olive text-[11.5px]">
              500 créditos/mês · renova todo dia 1
            </span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive-dark text-[12px] font-semibold">
              Assinar ›
            </span>
          </button>
        </div>
        <div className="flex items-center gap-3 pt-[3px]">
          <span className="text-muted text-[12px]">
            Seus créditos grátis renovam em {credits.renewsInDays} dias.
          </span>
          <div className="flex-1" />
          <button
            onClick={close}
            className="text-muted-2 text-[12.5px] font-medium underline"
          >
            Voltar ao molde
          </button>
        </div>
      </div>
    </div>
  );
}
