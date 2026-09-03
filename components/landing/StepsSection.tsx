"use client";

import { useTranslations } from "next-intl";
import { Reveal } from "./reveal";

const STEPS = [
  { key: "describe", src: "/landing/step-describe.svg" },
  { key: "adjust", src: "/landing/step-adjust.svg" },
  { key: "export", src: "/landing/step-export.svg" },
] as const;

// English id -- the "Como funciona" nav anchor's target, per the
// English-identifiers/pt-BR-display-text boundary.
//
// The three thumbnails are cartooned SVGs drawn from real captures of the
// same drafted shirt, one per step: the conversation that produced it, the
// seam-conflict warning it raised, and the cut plan with its fabric
// consumption. Each renders in a 321x148 box -- far too small for a
// screenshot to stay legible -- so they are drawn at that size instead. See
// the note in LandingHero.
//
// A sleeve and a body panel are given deliberately different silhouettes (a
// domed cap versus flat shoulders and a neck scoop): drawn alike they read as
// identical blobs rather than as a garment.
//
// A2 #8: three steps, no more. The cards stagger in per B7 rather than all
// appearing at once, which is what makes the sequence read as a sequence.
export function StepsSection() {
  const t = useTranslations("Landing");

  return (
    <section id="how-it-works" className="bg-surface">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-12 px-4 py-24 sm:px-6">
        <Reveal className="flex flex-col gap-3">
          <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
            {t("steps.eyebrow")}
          </span>
          <h2 className="max-w-[680px] text-3xl font-semibold text-balance sm:text-4xl">
            {t("steps.sectionTitle")}
          </h2>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map(({ key, src }, i) => (
            <Reveal
              key={key}
              delayMs={i * 80}
              className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-4"
            >
              {/* B3 nested radius: a 16px outer radius with a 16px gap to
                  the thumbnail gives 16 - 16 = 0, which is below the
                  formula's floor of 2, so the inner shape stays square-ish
                  at the smallest step rather than taking a derived radius. */}
              <div className="bg-paper h-[148px] overflow-hidden rounded-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    fixed-size decorative thumbnail; no repo precedent for
                    next/image and none of its optimization pipeline
                    (remote loaders, responsive srcset) applies here. */}
                <img
                  src={src}
                  alt={t(`steps.${key}.imageAlt`)}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
                {t(`steps.${key}.step`)}
              </span>
              <h3 className="text-lg font-semibold">
                {t(`steps.${key}.title`)}
              </h3>
              <p className="text-muted-2 text-base text-pretty">
                {t(`steps.${key}.body`)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
