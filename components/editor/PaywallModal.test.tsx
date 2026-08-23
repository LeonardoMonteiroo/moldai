import { describe, it, expect, beforeEach } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import { useEditorStore } from "@/lib/store";
import { PaywallModal } from "./PaywallModal";

const t = ptBR.PaywallModal;

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

    const expected = t.description
      .replace("{action}", t.actions.graduate)
      .replace("{required}", "3")
      .replace("{balance}", "1");
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("resolves the adjust action code through the catalog, already capitalised", () => {
    useEditorStore.setState((s) => ({
      paywall: { ...s.paywall, action: "adjust" },
    }));
    renderWithIntl(<PaywallModal />);

    const expected = t.description
      .replace("{action}", t.actions.adjust)
      .replace("{required}", "3")
      .replace("{balance}", "1");
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
});
