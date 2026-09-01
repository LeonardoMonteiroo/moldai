"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_ID = "app-shell-sidebar";

/**
 * #119: the one breakpoint every in-scope screen collapses at, and the one
 * EditorShell's own desktop-only gate matches too -- exported so the two
 * don't each hardcode 1024 independently (there's no tailwind.config.ts to
 * import a shared value from instead).
 */
export const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * The standard system screen. Every full-page screen renders through it.
 *
 * It builds PageHeader itself from plain data rather than accepting a header
 * element, which is what keeps "one header everywhere" enforceable instead of
 * merely documented.
 *
 * `sidebar` is whatever nav column the screen owns (the dashboard's Sidebar,
 * SettingsSidebar) — there is deliberately no global nav. The sidebar's own
 * chrome (w-[186px] border-r bg-surface p-[14px]) stays with that component.
 *
 * The content region is a column; a screen with a row body (the editor) passes
 * one child that is itself a row.
 *
 * `title` is optional: a screen whose sidebar already names the current
 * section (the dashboard) omits it rather than printing the same words twice.
 *
 * #48: PageHeader's own root is a <header> (banner landmark) and its title
 * span is an <h1> when `title` is given; the content region here is a
 * <main id="main">, and `footer` (when passed) is wrapped in a <footer> --
 * one shared fix repairs the landmark structure and heading hierarchy on
 * every screen that renders through AppShell at once.
 *
 * #119: below the `lg` breakpoint (1024px, the closest standard Tailwind step
 * to the ~1100px the issue measured overflow at) a passed `sidebar` becomes an
 * off-canvas drawer instead of the permanent 186px column each sidebar
 * component still owns -- this is the one place that knows about every
 * sidebar-bearing screen, so the toggle lives here rather than duplicated into
 * Sidebar/SettingsSidebar. The collapse itself is pure CSS (`hidden`/`lg:block`
 * -- real `display:none` when closed below `lg`, not just an off-screen
 * transform, so its links drop out of the tab order and the accessibility
 * tree instead of staying reachable-but-invisible).
 *
 * The open drawer additionally makes `<main>` and the header `inert` (focus
 * and AT can't reach the dimmed content sitting behind the overlay), closes
 * on Escape or a backdrop/inside click (any nav entry included -- covers
 * both a `router.push` and a same-route `router.replace`, e.g. the settings
 * sidebar's `?section=` links, which don't unmount AppShell the way a real
 * navigation does), and returns focus to the toggle button that opened it
 * rather than dropping it to the document body.
 */
export function AppShell({
  title,
  subtitle,
  backHref,
  credits,
  userEmail,
  sidebar,
  footer,
  headerActions,
  children,
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  credits: Credits | null;
  userEmail: string;
  sidebar?: ReactNode;
  footer?: ReactNode;
  /** Screen-specific header chrome, threaded straight to PageHeader's `actions`. */
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("AppShell");
  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeNav = () => {
    setNavOpen(false);
    // Escape and the backdrop click both close from focus that isn't on the
    // toggle itself (or isn't focused at all) -- without this, focus drops to
    // <body> and the next Tab restarts from the top of the page.
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNav();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* inert while the drawer is open: real desktop widths never set
          navOpen (the toggle that flips it is itself lg:hidden), so this
          never fires there -- only while the below-lg overlay is showing. */}
      <div inert={navOpen || undefined}>
        <PageHeader
          title={title}
          subtitle={subtitle}
          backHref={backHref}
          credits={credits}
          userEmail={userEmail}
          actions={headerActions}
        />
      </div>
      {sidebar && (
        <div className="border-border bg-surface flex items-center border-b px-[14px] py-[8px] lg:hidden">
          <Button
            ref={toggleRef}
            variant="outline"
            size="icon-sm"
            aria-expanded={navOpen}
            aria-controls={SIDEBAR_ID}
            aria-label={navOpen ? t("closeNavLabel") : t("openNavLabel")}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {sidebar && (
          <>
            {navOpen && (
              <div
                aria-hidden="true"
                onClick={closeNav}
                className="bg-overlay absolute inset-0 z-20 lg:hidden"
              />
            )}
            {/* `hidden` below `lg` when closed -- real display:none, so the
                nav links drop out of the tab order and the accessibility
                tree instead of just sliding off-screen. `lg:block` keeps it
                a permanent, always-visible column at `lg` and up regardless
                of `navOpen` (which never becomes true there in real use). */}
            <div
              id={SIDEBAR_ID}
              // Any click inside closes the drawer -- covers every nav
              // entry, including a same-route router.replace (e.g. the
              // settings sidebar's `?section=` links) that wouldn't unmount
              // AppShell the way a real navigation does. Capture phase, on a
              // structural wrapper around content that is itself already
              // interactive (real buttons/links) -- this isn't a control of
              // its own, so it deliberately doesn't take a keyboard handler.
              onClickCapture={() => setNavOpen(false)}
              className={cn(
                "absolute inset-y-0 left-0 z-30 lg:static lg:z-auto lg:block",
                navOpen ? "shadow-modal block" : "hidden",
              )}
            >
              {sidebar}
            </div>
          </>
        )}
        <main
          id="main"
          inert={navOpen || undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {children}
        </main>
      </div>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}
