import type { ReactElement } from "react";
import { expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import messages from "@/messages/pt-BR.json";

/**
 * Renders inside the real pt-BR catalog rather than a mocked translator, so a
 * component reading a key that does not exist fails the test instead of
 * silently rendering the key name.
 */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * The catalog itself. Tests assert against these values instead of pasting
 * pt-BR literals — required by the repo's no-hardcoded-display-text rule, and
 * it makes a copy change a one-place edit rather than a test failure.
 */
export { default as ptBR } from "@/messages/pt-BR.json";

export { screen, within, waitFor, act } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

/**
 * Resolves one namespace's real ICU strings (plurals, selects, interpolation)
 * instead of pasting resolved pt-BR text into a test or naively
 * string-replacing a raw "{var}" placeholder, which breaks the moment a key
 * becomes a plural (#106). next-intl doesn't throw on a missing key -- it
 * renders the literal key path -- so this asserts the result never contains
 * the key itself, catching a catalog gap at the source instead of it
 * silently matching whatever a component renders for the same miss.
 */
export function translatorFor(namespace: keyof typeof messages) {
  // Loosely typed on purpose: this helper is meant to take any namespace
  // string, which createTranslator's own generic (built for one literal
  // namespace at a time) can't express. Correctness is enforced at runtime
  // by the "never contains the key" check below, not by the type system.
  const translate = createTranslator({
    locale: "pt-BR",
    messages,
    namespace,
  } as never);
  return function t(key: string, values?: Record<string, string | number>) {
    const resolved = (translate as (k: string, v?: unknown) => string)(
      key,
      values,
    );
    expect(resolved).not.toContain(key);
    return resolved;
  };
}

/**
 * #206: the rendered form of a formatBRL price, for a getByText matcher.
 *
 * Intl.NumberFormat("pt-BR", {currency:"BRL"}) puts a NON-BREAKING space
 * (U+00A0) between "R$" and the amount -- correct typography, since the
 * symbol must not be orphaned at a line break. Testing Library normalizes
 * the DOM's text (collapsing U+00A0 to a plain space) but compares a string
 * matcher verbatim, so asserting formatBRL's own output directly fails on
 * that one invisible byte. This applies the same normalization to the
 * expected side.
 *
 * Takes the already-formatted string rather than the cents, so a test still
 * reads its expectation out of lib/billing/plans.ts and never pastes a
 * currency literal of its own.
 */
export function priceText(formatted: string): string {
  return formatted.replace(/\s/g, " ");
}
