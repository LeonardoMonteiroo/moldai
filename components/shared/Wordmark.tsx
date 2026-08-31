import Link from "next/link";

/**
 * The MoldAI brand lockup. Deliberately has no "use client" directive: it is
 * rendered from client shells (PageHeader) and from the Server Component
 * app/verify/page.tsx alike -- `Link` is safe in both.
 */
export function Wordmark() {
  return (
    <Link
      href="/"
      className="font-display text-title tracking-wordmark font-bold no-underline"
    >
      Mold<span className="text-olive">AI</span>
    </Link>
  );
}
