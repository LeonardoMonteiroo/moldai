import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
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
