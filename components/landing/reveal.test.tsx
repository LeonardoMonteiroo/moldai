import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Reveal, LitWords } from "./reveal";

// Regression guard for a bug that only showed in a real browser: sections
// left permanently invisible after a jump-scroll.
//
// The marketing pages scroll inside a Radix ScrollArea, not the window. With
// IntersectionObserver's default `root: null` the browser still clips the
// target by that scrolling ancestor, and `rootMargin` cannot expand past the
// clip -- so the oversized top margin that makes "already scrolled past"
// count as intersecting did nothing at all. Measured in the running app:
// jumping to the bottom of the landing page left 12 of 24 reveals stuck at
// opacity 0. Naming the scroller as the root fixed it (24 of 24).
//
// jsdom implements no IntersectionObserver, so these stub it and assert the
// OPTIONS the component passes -- which is the part that was wrong, and the
// part no rendered assertion could see.

type Captured = { root: Element | Document | null; rootMargin?: string };

function stubObserver(captured: Captured[]) {
  class FakeObserver {
    constructor(
      _cb: IntersectionObserverCallback,
      opts?: IntersectionObserverInit,
    ) {
      captured.push({
        root: (opts?.root ?? null) as Element | null,
        rootMargin: opts?.rootMargin,
      });
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Reveal / LitWords · observer root", () => {
  it("observes against the Radix scroll viewport, not the window", () => {
    const captured: Captured[] = [];
    stubObserver(captured);

    render(
      <div data-radix-scroll-area-viewport data-testid="viewport">
        <Reveal>
          <p>conteúdo</p>
        </Reveal>
      </div>,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].root).toBe(screen.getByTestId("viewport"));
  });

  it("extends the root far upward so a section scrolled past still reveals", () => {
    const captured: Captured[] = [];
    stubObserver(captured);

    render(
      <div data-radix-scroll-area-viewport>
        <Reveal>
          <p>conteúdo</p>
        </Reveal>
      </div>,
    );

    // The top margin is the whole point: without it a jump-scroll takes a
    // section from below the viewport to above it without crossing any
    // threshold, no entry is delivered, and it stays invisible for good.
    const top = captured[0].rootMargin?.split(" ")[0] ?? "";
    expect(Number.parseInt(top, 10)).toBeGreaterThanOrEqual(9999);
  });

  it("falls back to the window when there is no scroll area around it", () => {
    const captured: Captured[] = [];
    stubObserver(captured);

    render(
      <Reveal>
        <p>conteúdo</p>
      </Reveal>,
    );

    expect(captured[0].root).toBeNull();
  });

  it("gives LitWords the same root and the same upward margin", () => {
    const captured: Captured[] = [];
    stubObserver(captured);

    render(
      <div data-radix-scroll-area-viewport data-testid="viewport">
        <LitWords text="Você corta" />
      </div>,
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].root).toBe(screen.getByTestId("viewport"));
    const top = captured[0].rootMargin?.split(" ")[0] ?? "";
    expect(Number.parseInt(top, 10)).toBeGreaterThanOrEqual(9999);
  });

  // The other half of the contract, already relied on by LandingPage.test:
  // with no IntersectionObserver at all the content must end up READABLE,
  // never stuck at its start state.
  it("falls back to the end state when IntersectionObserver is missing", () => {
    const { container } = render(
      <>
        <Reveal>
          <p>conteúdo</p>
        </Reveal>
        <LitWords text="Você corta" />
      </>,
    );

    expect(container.querySelector("[data-reveal]")).toHaveAttribute(
      "data-reveal",
      "shown",
    );
    for (const word of container.querySelectorAll("[data-word]")) {
      expect(word).toHaveAttribute("data-lit", "true");
    }
  });
});
