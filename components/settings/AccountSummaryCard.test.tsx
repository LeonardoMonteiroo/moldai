import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  translatorFor,
} from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { AccountSummaryCard } from "./AccountSummaryCard";

const CREDITS: Credits = {
  plan: "free",
  balance: 18,
  total: 30,
  renewsInDays: 12,
};

describe("AccountSummaryCard", () => {
  it("shows the name, email, plan and credit figures", () => {
    renderWithIntl(
      <AccountSummaryCard
        name="Ana Ribeiro"
        email="ana@atelie.com.br"
        credits={CREDITS}
        memberSince="2026-03-15T00:00:00.000Z"
        patternCount={24}
      />,
    );
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
    expect(screen.getByText("ana@atelie.com.br")).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.PlanSection.plans.free.name),
    ).toBeInTheDocument();
    expect(screen.getByText("18/30")).toBeInTheDocument();
  });

  // #37: a top-up can push balance past total -- the same clamp PageHeader's
  // own credits bar uses.
  it("clamps the progress bar at 100% when balance exceeds total", () => {
    renderWithIntl(
      <AccountSummaryCard
        name="Ana"
        email="ana@atelie.com.br"
        credits={{ plan: "free", balance: 130, total: 30, renewsInDays: 5 }}
        memberSince="2026-03-15T00:00:00.000Z"
        patternCount={1}
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("renders the renewal note with the real day count", () => {
    const t = translatorFor("AccountSummaryCard");
    renderWithIntl(
      <AccountSummaryCard
        name="Ana"
        email="ana@atelie.com.br"
        credits={CREDITS}
        memberSince="2026-03-15T00:00:00.000Z"
        patternCount={24}
      />,
    );
    expect(screen.getByText(t("renewsNote", { days: 12 }))).toBeInTheDocument();
  });

  it("renders member-since with the formatted month/year and pattern count, pluralized", () => {
    const t = translatorFor("AccountSummaryCard");
    renderWithIntl(
      <AccountSummaryCard
        name="Ana"
        email="ana@atelie.com.br"
        credits={CREDITS}
        memberSince="2026-03-15T00:00:00.000Z"
        patternCount={1}
      />,
    );
    expect(
      screen.getByText(t("memberSince", { date: "março de 2026", count: 1 })),
    ).toBeInTheDocument();
  });

  it("falls back to the email as the primary line when no name is set", () => {
    renderWithIntl(
      <AccountSummaryCard
        name=""
        email="ana@atelie.com.br"
        credits={CREDITS}
        memberSince="2026-03-15T00:00:00.000Z"
        patternCount={0}
      />,
    );
    // Only one occurrence -- the primary line, not duplicated as a secondary
    // line too.
    expect(screen.getAllByText("ana@atelie.com.br")).toHaveLength(1);
  });
});
