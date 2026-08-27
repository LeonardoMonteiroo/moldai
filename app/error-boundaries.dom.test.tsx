import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { render } from "@testing-library/react";

// global-error.tsx loads its display fonts through next/font/google, which
// needs Next's own build-time transform -- stubbed with the two CSS-variable
// shapes it actually reads.
vi.mock("next/font/google", () => ({
  Bricolage_Grotesque: () => ({ variable: "--font-bricolage" }),
  Archivo: () => ({ variable: "--font-archivo" }),
}));

vi.mock("@/lib/observability/report", () => ({ reportError: vi.fn() }));

// not-found.tsx is an async Server Component reading the server-side
// catalog; resolved against the real messages so a missing key throws here.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    const ns = (await import("@/messages/pt-BR.json"))
      .default as unknown as Record<string, Record<string, string>>;
    return (key: string) => {
      const value = ns[namespace]?.[key];
      if (typeof value !== "string") {
        throw new Error(`missing catalog key: ${namespace}.${key}`);
      }
      return value;
    };
  },
}));

import AppError from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";
import { reportError } from "@/lib/observability/report";

/**
 * #168: `app/error-boundaries.test.ts` guards that these three files exist,
 * carry their "use client" directive, and have their catalog namespaces --
 * all it can do from the DOM-free `node` project. None of that executes a
 * line of them, so all three sat at 0%.
 *
 * They deserve a real render more than most components, because of when
 * they run: whatever they get wrong shows up only once something else has
 * already broken, on a screen the user reaches at their least forgiving
 * moment. Two things have to hold — the recovery affordance actually works
 * (retry calls back, the home link points home), and the failure reaches
 * `reportError`, since a boundary that swallows its own error leaves the
 * operator with nothing in stdout at all.
 */

const BOOM = Object.assign(new Error("boom"), { digest: "d1g3st" });

describe("app/error.tsx", () => {
  beforeEach(() => vi.mocked(reportError).mockReset());

  it("announces itself as an alert, in pt-BR, with a way back", () => {
    renderWithIntl(<AppError error={BOOM} retry={() => {}} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ptBR.AppError.heading }),
    ).toBeVisible();
    expect(screen.getByText(ptBR.AppError.message)).toBeVisible();
    // The way back into the app -- Next's own fallback had none.
    expect(
      screen.getByRole("link", { name: ptBR.AppError.homeLink }),
    ).toHaveAttribute("href", "/");
  });

  it("calls back into Next's retry when the retry button is pressed", async () => {
    const retry = vi.fn();
    renderWithIntl(<AppError error={BOOM} retry={retry} />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: ptBR.AppError.retryButton }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  // The digest is the only handle an operator has to correlate this screen
  // with a server-side log line, so it has to be reported, not just caught.
  it("reports the error and its digest through the one observability seam", () => {
    renderWithIntl(<AppError error={BOOM} retry={() => {}} />);

    expect(reportError).toHaveBeenCalledWith("app-error-boundary", BOOM, {
      digest: "d1g3st",
    });
  });

  it("still reports an error that carries no digest", () => {
    const bare = new Error("no digest");
    renderWithIntl(<AppError error={bare} retry={() => {}} />);

    expect(reportError).toHaveBeenCalledWith("app-error-boundary", bare, {
      digest: undefined,
    });
  });
});

describe("app/global-error.tsx", () => {
  beforeEach(() => vi.mocked(reportError).mockReset());

  // No NextIntlClientProvider: global-error replaces the root layout
  // entirely, so it reads the catalog as a static import instead of through
  // useTranslations. Rendered WITHOUT the intl wrapper here, deliberately --
  // that is the situation it actually runs in.
  //
  // React logs "In HTML, <html> cannot be a child of <div>" for each render
  // below. Expected and unavoidable: this component owns its own
  // <html>/<body> (that is the whole point of a global-error boundary) while
  // RTL always mounts into a div. The warning is about the test harness, not
  // the component.
  it("renders its own pt-BR copy with no intl provider mounted", () => {
    render(<GlobalError error={BOOM} retry={() => {}} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ptBR.GlobalError.heading }),
    ).toBeVisible();
    expect(screen.getByText(ptBR.GlobalError.message)).toBeVisible();
  });

  it("offers a working retry", async () => {
    const retry = vi.fn();
    render(<GlobalError error={BOOM} retry={retry} />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: ptBR.GlobalError.retryButton }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("reports through its own distinct scope, not the segment boundary's", () => {
    render(<GlobalError error={BOOM} retry={() => {}} />);

    // A different scope from app/error.tsx: the root layout failing is a
    // materially different incident from a segment throwing, and the log is
    // the only place that distinction survives.
    expect(reportError).toHaveBeenCalledWith("global-error-boundary", BOOM, {
      digest: "d1g3st",
    });
  });
});

describe("app/not-found.tsx", () => {
  // An async Server Component: awaited first, then its returned element is
  // what gets rendered.
  it("renders pt-BR copy and a link home for a wrong URL", async () => {
    render(await NotFound());

    expect(
      screen.getByRole("heading", { name: ptBR.NotFoundPage.heading }),
    ).toBeVisible();
    expect(screen.getByText(ptBR.NotFoundPage.message)).toBeVisible();
    // A stale bookmark to a pre-rename route (/molde/[id], /configuracoes)
    // lands here, so the way back matters more than the copy.
    expect(
      screen.getByRole("link", { name: ptBR.NotFoundPage.homeLink }),
    ).toHaveAttribute("href", "/");
  });

  // A 404 is not an application error; reporting one would turn every
  // crawler hitting a dead URL into operator noise.
  it("does not report a wrong URL as an error", async () => {
    vi.mocked(reportError).mockReset();
    render(await NotFound());
    expect(reportError).not.toHaveBeenCalled();
  });
});
