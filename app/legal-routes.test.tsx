import { describe, it, expect, vi, beforeEach } from "vitest";

// /privacy and /terms are public, like /planos: they render signed out (the
// visitor deciding whether to sign up is exactly who reads them) and signed
// in. The session is read only so the nav can offer the way back into the app
// instead of an "Entrar" button someone is already past -- which is the one
// behaviour worth pinning here, since app/page-guards.test.tsx covers the
// route table but never exercises a PUBLIC page's body.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Resolves dotted paths against the REAL catalog, the same stub the other
// route tests use: a key that does not exist throws here rather than
// rendering its own key path.
vi.mock("next-intl/server", async () => {
  const messages = (await import("@/messages/pt-BR.json")).default as Record<
    string,
    unknown
  >;
  return {
    getTranslations: vi.fn(async (namespace: string) => {
      const ns = messages[namespace];
      if (!ns) throw new Error(`unknown catalog namespace: ${namespace}`);
      return (key: string) => {
        const value = key
          .split(".")
          .reduce<unknown>(
            (node, part) =>
              node && typeof node === "object"
                ? (node as Record<string, unknown>)[part]
                : undefined,
            ns,
          );
        if (typeof value !== "string") {
          throw new Error(`missing catalog key: ${namespace}.${key}`);
        }
        return value;
      };
    }),
  };
});

// The page bodies are client components; rendering them belongs to the dom
// project (components/legal/LegalPage.test.tsx). Stubbed to a marker so this
// suite can assert the props each route hands over.
vi.mock("@/components/legal/LegalPage", () => ({
  LegalPage: (props: { kind: string; signedIn: boolean }) => props,
}));

import { auth } from "@/auth";
import ptBR from "@/messages/pt-BR.json";
import PrivacyPage, { generateMetadata as privacyMeta } from "./privacy/page";
import TermsPage, { generateMetadata as termsMeta } from "./terms/page";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

type Rendered = { props: { kind: string; signedIn: boolean } };

describe("app/privacy and app/terms", () => {
  beforeEach(() => mockAuth.mockReset());

  it.each([
    ["privacy", PrivacyPage],
    ["terms", TermsPage],
  ] as const)("renders %s without a session", async (kind, Page) => {
    mockAuth.mockResolvedValue(null);

    const result = (await Page()) as unknown as Rendered;

    expect(result.props.kind).toBe(kind);
    expect(result.props.signedIn).toBe(false);
  });

  it.each([
    ["privacy", PrivacyPage],
    ["terms", TermsPage],
  ] as const)("tells %s that a visitor is signed in", async (_kind, Page) => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    const result = (await Page()) as unknown as Rendered;

    expect(result.props.signedIn).toBe(true);
  });

  it.each([
    ["privacy", privacyMeta],
    ["terms", termsMeta],
  ] as const)("gives %s its own title and description", async (kind, meta) => {
    const ns = ptBR.Legal[kind] as {
      metaTitle: string;
      metaDescription: string;
    };

    await expect(meta()).resolves.toEqual({
      title: ns.metaTitle,
      description: ns.metaDescription,
      // Self-referencing and relative, resolved against the root layout's
      // metadataBase. Without it every ?utm_* variant of these URLs is a
      // separate indexable duplicate.
      alternates: { canonical: `/${kind}` },
    });
  });
});
