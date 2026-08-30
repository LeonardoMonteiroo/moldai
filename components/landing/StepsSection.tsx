"use client";

import { useTranslations } from "next-intl";

const STEPS = [
  { key: "describe", src: "/landing/step-describe.svg" },
  { key: "adjust", src: "/landing/step-adjust.svg" },
  { key: "export", src: "/landing/step-export.svg" },
] as const;

// English id -- the "Como funciona" nav anchor's target, per the
// English-identifiers/pt-BR-display-text boundary. Each card's thumbnail
// (public/landing/*.svg) is a neutral placeholder -- a plain image glyph on
// the surface-alt token -- deliberately standing in for real artwork rather
// than claiming to be one, until the real step images ship.
export function StepsSection() {
  const t = useTranslations("Landing");

  return (
    <section id="how-it-works" className="bg-surface">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-[22px] px-[34px] py-14">
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
