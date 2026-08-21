/**
 * The MoldAI brand lockup. Deliberately has no "use client" directive: it is
 * rendered from client shells (PageHeader) and from the Server Component
 * app/verify/page.tsx alike.
 */
export function Wordmark() {
  return (
    <span className="font-display text-title tracking-wordmark font-bold">
      Mold<span className="text-olive">AI</span>
    </span>
  );
}
