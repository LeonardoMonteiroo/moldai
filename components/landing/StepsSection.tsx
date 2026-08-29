"use client";

import { useTranslations } from "next-intl";

const STEPS = [
  { key: "describe", src: "/landing/step-describe.png" },
  { key: "adjust", src: "/landing/step-adjust.png" },
  { key: "export", src: "/landing/step-export.png" },
] as const;

// English id -- the "Como funciona" nav anchor's target, per the
// English-identifiers/pt-BR-display-text boundary. Each card's thumbnail is
// a real screenshot of the editor (public/landing/*.png), not a stock icon
// or a fabricated mockup -- captured from an actual generation/adjustment/
// cut-plan run so what's shown is what the app really produces.
export function StepsSection() {
  const t = useTranslations("Landing");

  return (
    <section id="how-it-works" className="bg-surface">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-[22px] px-[30px] py-14">
        <div className="flex flex-col gap-1.5">
          <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
            {t("steps.eyebrow")}
          </span>
          <h2 className="font-display text-display max-w-[620px] font-semibold">
            {t("steps.sectionTitle")}
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-[18px]">
          {STEPS.map(({ key, src }) => (
            <div
              key={key}
              className="bg-surface border-border rounded-card flex flex-col gap-3 border p-4"
            >
              <div className="bg-paper rounded-item h-[148px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    fixed-size decorative thumbnail; no repo precedent for
                    next/image and none of its optimization pipeline (remote
                    loaders, responsive srcset) applies here. */}
                <img
                  src={src}
                  alt={t(`steps.${key}.imageAlt`)}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
                {t(`steps.${key}.step`)}
              </span>
              <span className="font-display text-body font-semibold">
                {t(`steps.${key}.title`)}
              </span>
              <span className="text-muted-2 text-ui">
                {t(`steps.${key}.body`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
