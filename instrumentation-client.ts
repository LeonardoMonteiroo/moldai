// #275: Next auto-loads this file for the browser bundle (the client-side
// counterpart of instrumentation.ts's register()). It's what lets
// reportError() calls from client components -- app/error.tsx,
// app/global-error.tsx, components/editor/Proof3DTab.tsx -- actually reach
// Sentry, not just the ones on the server. A no-op when
// NEXT_PUBLIC_SENTRY_DSN is unset, same as the server side.
//
// Relative import, not "@/..." -- same caution as next.config.ts and
// instrumentation.ts: this file loads outside the app's normal module
// resolution, before the tsconfig path alias is guaranteed to apply.
import * as Sentry from "@sentry/nextjs";
import { initSentry } from "./lib/observability/sentry";

// Not awaited -- Next's own docs for this file: only synchronous top-level
// code is guaranteed to run before hydration, so async work here (this
// dynamic-import-based init included) is inherently fire-and-forget.
void initSentry("browser");

// Reports a client-side navigation that never settles (Next's own hook,
// wired per the SDK's documented setup) -- not something reportError()
// covers, since nothing in the app calls it for a stuck transition.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
