import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";
import messages from "@/messages/pt-BR.json";

/**
 * #168: the four centered-card auth shells (/login, /signup, /verify,
 * /password-reset). They are the one group of `page.tsx` files that really
 * is markup plus a `generateMetadata` -- but the metadata is not
 * decoration: /password-reset shipped with its title hardcoded to
 * `requestHeading` regardless of the token, so the mailed reset link opened
 * a tab reading "Esqueci minha senha" over a "Nova senha" form. That is
 * exactly a metadata-only bug, invisible to any test of the body.
 *
 * The token branch is the other half: /verify treats a missing token as an
 * error state, while /password-reset treats it as a legitimate entry point
 * (the "Esqueci minha senha" link, which carries no token). Swap those and
 * one screen refuses a valid visitor while the other offers to set a new
 * password with nothing authorizing it.
 *
 * `getTranslations` is mocked to resolve against the REAL catalog rather
 * than echoing keys, so a metadata title that names a missing key surfaces
 * here instead of passing with the key path as its value.
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace];
    if (!ns) throw new Error(`unknown catalog namespace: ${namespace}`);
    return (key: string) => {
      const value = ns[key];
      if (typeof value !== "string") {
        throw new Error(`missing catalog key: ${namespace}.${key}`);
      }
      return value;
    };
  },
}));

vi.mock("@/components/auth/LoginCard", () => ({ default: () => null }));
vi.mock("@/components/auth/SignupCard", () => ({ default: () => null }));
vi.mock("@/components/auth/VerifyCard", () => ({ default: () => null }));
vi.mock("@/components/auth/PasswordResetCard", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/Wordmark", () => ({ Wordmark: () => null }));

import LoginPage, { generateMetadata as loginMetadata } from "./login/page";
import SignupPage, { generateMetadata as signupMetadata } from "./signup/page";
import VerifyPage, { generateMetadata as verifyMetadata } from "./verify/page";
import PasswordResetPage, {
  generateMetadata as resetMetadata,
} from "./password-reset/page";
import VerifyCard from "@/components/auth/VerifyCard";
import PasswordResetCard from "@/components/auth/PasswordResetCard";

/** Every element in the tree, depth-first, including the root. */
function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elements(element.props?.children)];
}

function findByType<P>(node: ReactNode, type: unknown) {
  return elements(node).find((el) => el.type === type) as
    ReactElement<P> | undefined;
}

function textOf(node: ReactNode): string {
  return elements(node)
    .map((el) => {
      const children = (el.props as { children?: ReactNode })?.children;
      return typeof children === "string" ? children : "";
    })
    .join(" ");
}

describe("auth page metadata", () => {
  it("gives /login its own tab title from the catalog", async () => {
    expect((await loginMetadata()).title).toBe(messages.Login.heading);
  });

  it("gives /signup its own tab title from the catalog", async () => {
    expect((await signupMetadata()).title).toBe(messages.Signup.heading);
  });

  it("gives /verify its own tab title from the catalog", async () => {
    expect((await verifyMetadata()).title).toBe(messages.Verify.heading);
  });

  // The regression this file exists for: the title has to follow the token,
  // because the token is what decides which form is on screen.
  it("titles /password-reset by which form the token actually produces", async () => {
    expect(
      (await resetMetadata({ searchParams: Promise.resolve({}) })).title,
    ).toBe(messages.PasswordReset.requestHeading);
    expect(
      (
        await resetMetadata({
          searchParams: Promise.resolve({ token: "tok" }),
        })
      ).title,
    ).toBe(messages.PasswordReset.confirmHeading);
  });
});

describe("auth page bodies", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["/login", () => LoginPage(), messages.Login.heading],
    ["/signup", () => SignupPage(), messages.Signup.heading],
  ] as [string, () => Promise<ReactNode>, string][])(
    "%s renders its own heading above the card",
    async (_route, render, heading) => {
      const tree = await render();
      expect(textOf(tree)).toContain(heading);
    },
  );

  // /verify: a missing token IS an error -- there is nothing to confirm, so
  // offering the confirm button would guarantee a failed request.
  it("/verify shows the missing-token error and no card without a token", async () => {
    const tree = await VerifyPage({ searchParams: Promise.resolve({}) });
    expect(findByType(tree, VerifyCard)).toBeUndefined();
    expect(textOf(tree)).toContain(messages.Verify.missingToken);
  });

  it("/verify hands the token straight to the card", async () => {
    const tree = await VerifyPage({
      searchParams: Promise.resolve({ token: "tok" }),
    });
    expect(findByType<{ token: string }>(tree, VerifyCard)?.props.token).toBe(
      "tok",
    );
    expect(textOf(tree)).not.toContain(messages.Verify.missingToken);
  });

  // /password-reset: a missing token is NOT an error -- it is the entry
  // point reached from "Esqueci minha senha", which has no token to carry.
  // The card itself branches on the empty string.
  it.each([
    ["no token at all", {}, ""],
    ["a token from the mailed link", { token: "tok" }, "tok"],
  ] as [string, { token?: string }, string][])(
    "/password-reset passes %s through to the card",
    async (_name, searchParams, expected) => {
      const tree = await PasswordResetPage({
        searchParams: Promise.resolve(searchParams),
      });
      const card = findByType<{ token: string }>(tree, PasswordResetCard);
      // Never absent: unlike /verify there is no error state to show here.
      expect(card).toBeDefined();
      expect(card?.props.token).toBe(expected);
    },
  );
});
