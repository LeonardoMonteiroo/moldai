import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, screen, ptBR } from "@/components/test-utils";
import { COSTS } from "@/lib/types";
import { PLAN_CREDITS } from "@/lib/billing/plans";
import { LegalPage } from "./LegalPage";

vi.mock("next/navigation", () => ({ usePathname: () => "/privacy" }));

const resolve = (s: string) =>
  s
    .replace("{adjust}", String(COSTS.adjust))
    .replace("{graduate}", String(COSTS.graduate))
    .replace("{credits}", String(PLAN_CREDITS.free));

describe("LegalPage", () => {
  it.each([
    ["privacy", ["account", "work", "ai", "billing", "cookies", "deletion"]],
    ["terms", ["service", "credits", "plans", "beta", "fit", "account"]],
  ] as const)("renders every %s section with its exact copy", (kind, keys) => {
    renderWithIntl(<LegalPage kind={kind} />);

    const ns = ptBR.Legal[kind] as unknown as {
      title: string;
      intro: string;
      sections: Record<string, { title: string; body: string }>;
    };

    expect(
      screen.getByRole("heading", { name: ns.title, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(ns.intro)).toBeInTheDocument();

    for (const key of keys) {
      expect(
        screen.getByRole("heading", { name: ns.sections[key].title }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(resolve(ns.sections[key].body)),
      ).toBeInTheDocument();
    }
  });

  // These pages describe what the code does; they have had no legal review,
  // and saying so on screen is the whole reason they are allowed to exist.
  // Losing that note would turn an honest summary into an implied contract.
  it("states on screen that it has had no legal review", () => {
    renderWithIntl(<LegalPage kind="terms" />);

    expect(screen.getByText(ptBR.Legal.reviewNote)).toBeInTheDocument();
  });

  // B10: a way back from every page.
  it("offers a way back to the landing page", () => {
    renderWithIntl(<LegalPage kind="privacy" />);

    expect(
      screen.getByRole("link", { name: ptBR.Legal.backHome }),
    ).toHaveAttribute("href", "/");
  });

  // The credits section quotes what the app really charges, so a change to
  // COSTS has to show up here rather than leaving a stale promise in the
  // terms.
  it("quotes the real costs in the terms, not hardcoded numbers", () => {
    renderWithIntl(<LegalPage kind="terms" />);

    const body = resolve(ptBR.Legal.terms.sections.credits.body);
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(body).toContain(String(COSTS.graduate));
    expect(body).not.toMatch(/\{\w+\}/);
  });
});
