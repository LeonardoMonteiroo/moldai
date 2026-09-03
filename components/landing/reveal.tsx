"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// B7 / B11 of the landing-page-design skill. Both primitives here are
// IntersectionObserver-based on purpose: the skill forbids
// window.addEventListener("scroll") outright, because a scroll handler
// reflows continuously and is what kills marketing-page performance on
// mobile. Nothing in this file reads scrollY.
//
// The visual states themselves live in app/globals.css (the [data-reveal]
// and .marketing-word rules) rather than in a className toggle here, so the
// prefers-reduced-motion override can neutralise them in ONE place instead
// of every call site having to remember it.

/**
 * B7 scroll interpolation: a section fades up from
 * `translate-y-16 blur-md opacity-0` as it enters the viewport, over 800ms.
 *
 * Reveals once and then stops observing -- re-animating a section every time
 * it re-enters makes a long page feel unstable while scrolling back up.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Deliberately NOT React state. "Revealed" is a one-way visual flag that
  // changes nothing else on the page, so writing the attribute directly (the
  // same thing LitWords below does) avoids a re-render per section and keeps
  // the server and client first paints byte-identical -- deriving the initial
  // value from `typeof IntersectionObserver` instead would render "shown" on
  // the server and "hidden" on the client, which is a hydration mismatch.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => {
      el.dataset.reveal = "shown";
    };
    // Without IntersectionObserver (jsdom does not implement it, and
    // vitest.setup.ts stubs ResizeObserver but not this one) the honest
    // fallback is the END state: content visible, never a section stuck at
    // opacity 0 with no event that can ever arrive to un-stick it.
    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }
    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          if (delayMs > 0) {
            timer = window.setTimeout(show, delayMs);
          } else {
            show();
          }
        }
      },
      // Fire a little before the element is fully on screen, so the motion
      // reads as the section arriving rather than catching up to the reader.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [delayMs]);

  return (
    <div ref={ref} data-reveal="hidden" className={className}>
      {children}
    </div>
  );
}

/**
 * B11: splits a line into words that light up ONE AT A TIME, in reading
 * order, as each crosses a trigger line -- not the whole block flipping at
 * once.
 *
 * The trigger line is expressed as a bottom rootMargin, so a word "crosses"
 * it when it reaches roughly the lower third of the viewport. Because the
 * words are laid out in reading order, the observer fires them in that order
 * for free, with no per-word delay to keep in sync with scroll speed.
 */
export function LitWords({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const words = text.split(" ");

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-word]"));
    if (typeof IntersectionObserver === "undefined") {
      for (const node of nodes) node.dataset.lit = "true";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.lit = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -33% 0px", threshold: 1 },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={ref}>
      {words.map((word, i) => (
        <span
          // The index is part of the key because a tagline can legitimately
          // repeat a word, and two identical words are still two elements.
          key={`${word}-${i}`}
          data-word
          data-lit="false"
          className="marketing-word"
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
