import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  translatorFor,
} from "@/components/test-utils";
import { useEditorStore } from "@/lib/store";
import { PaywallModal } from "./PaywallModal";

const t = ptBR.PaywallModal;
const tPaywall = translatorFor("PaywallModal");

const CREDITS = {
  plan: "free" as const,
  balance: 1,
  total: 30,
  renewsInDays: 10,
};

beforeEach(() => {
  useEditorStore.setState({
    credits: CREDITS,
    purchasing: false,
    paywall: {
      open: true,
      required: 3,
      balance: 1,
      action: null,
      retry: null,
    },
  });
});

describe("PaywallModal", () => {
  it("resolves the graduate action code through the catalog, already capitalised", () => {
    useEditorStore.setState((s) => ({
      paywall: { ...s.paywall, action: "graduate" },
    }));
    renderWithIntl(<PaywallModal />);

    const expected = tPaywall("description", {
      action: t.actions.graduate,
      required: 3,
      balance: 1,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("resolves the adjust action code through the catalog, already capitalised", () => {
    useEditorStore.setState((s) => ({
      paywall: { ...s.paywall, action: "adjust" },
    }));
    renderWithIntl(<PaywallModal />);

    const expected = tPaywall("description", {
      action: t.actions.adjust,
      required: 3,
      balance: 1,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("never crashes and stays closed when action is null (the paywall's resting state)", () => {
    useEditorStore.setState((s) => ({
      paywall: { ...s.paywall, open: false, action: null },
    }));
    renderWithIntl(<PaywallModal />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // #31: double-clicking either plan card sent two purchase requests --
  // nothing disabled them while the first was still in flight, so a top-up
  // granted double credits with no idempotency key on the server side to
  // catch it.
  it("disables both plan cards while a purchase is already in flight", () => {
    useEditorStore.setState({ purchasing: true });
    renderWithIntl(<PaywallModal />);

    const topupButton = screen.getByText(t.topupCta).closest("button")!;
    const subscribeButton = screen.getByText(t.subscribeCta).closest("button")!;
    expect(topupButton).toBeDisabled();
    expect(subscribeButton).toBeDisabled();
  });

  it("leaves both plan cards enabled when no purchase is in flight", () => {
    useEditorStore.setState({ purchasing: false });
    renderWithIntl(<PaywallModal />);

    expect(screen.getByText(t.topupCta).closest("button")).toBeEnabled();
    expect(screen.getByText(t.subscribeCta).closest("button")).toBeEnabled();
  });

  // #106: {required} créditos and {days} dias were hardcoded plural nouns --
  // "usa 1 créditos" and "renovam em 1 dias" both rendered on the last day
  // of a billing cycle / against a single missing credit.
  it("pluralizes the required-credits description at 0, 1 and 2", () => {
    for (const required of [0, 1, 2]) {
      useEditorStore.setState((s) => ({
        paywall: { ...s.paywall, action: "adjust", required },
      }));
      const { unmount } = renderWithIntl(<PaywallModal />);
      const expected = tPaywall("description", {
        action: t.actions.adjust,
        required,
        balance: 1,
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  // #112: "renova todo dia 1" claimed a fixed calendar renewal day the
  // wallet doesn't implement -- renewWallet rolls renewsAt forward 30 days
  // from the previous (scheduled) renewal, so the actual date drifts
  // through the month depending on when the user subscribed.
  it("describes the 30-day renewal cycle the wallet actually implements, not a fixed calendar day", () => {
    renderWithIntl(<PaywallModal />);
    expect(screen.getByText(t.subscribeDetail)).toBeInTheDocument();
    expect(t.subscribeDetail).not.toMatch(/dia \d+\b/);
    expect(t.subscribeDetail).toMatch(/30 dias/);
  });

  // A regression guard for this exact phrasing reappearing anywhere else in
  // the catalog -- not a full semantic audit of "claims a fixed calendar
  // day" (a rephrase like "renova sempre no dia 1" would slip past a single
  // regex the same way CLAUDE.md's i18n section already documents for
  // hardcoded-text sweeps: no one grep shape catches every phrasing). The
  // full acceptance-criteria check was the manual repo-wide grep run before
  // this fix, confirming no sibling site had the same claim.
  it("does not repeat the exact fixed-calendar-day phrasing anywhere in the catalog", () => {
    const raw = JSON.stringify(ptBR);
    expect(raw).not.toMatch(/todo dia \d+/);
  });

  it("pluralizes the renewal note at 0, 1 and 2 days", () => {
    for (const days of [0, 1, 2]) {
      useEditorStore.setState((s) => ({
        credits: { ...s.credits!, renewsInDays: days },
      }));
      const { unmount } = renderWithIntl(<PaywallModal />);
      const expected = tPaywall("renewsNote", { days });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});
