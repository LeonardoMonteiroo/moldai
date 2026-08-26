"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_ID = "app-shell-sidebar";

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
 * Sidebar/SettingsSidebar. Pure CSS (`lg:static lg:translate-x-0`) drives the
 * collapse itself; the only JS state is the drawer's open/closed toggle. Every
 * nav entry navigates via router.push/replace, which unmounts this AppShell
 * instance on route change, so there is no explicit close-on-navigate wiring.
 */
export function AppShell({
  title,
  subtitle,
  backHref,
  credits,
  userEmail,
  sidebar,
  footer,
  children,
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  credits: Credits | null;
  userEmail: string;
  sidebar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("AppShell");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        credits={credits}
        userEmail={userEmail}
      />
      {sidebar && (
        <div className="border-border bg-surface flex items-center border-b px-[14px] py-[8px] lg:hidden">
          <Button
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
                onClick={() => setNavOpen(false)}
                className="bg-overlay absolute inset-0 z-20 lg:hidden"
              />
            )}
            <div
              id={SIDEBAR_ID}
              className={cn(
                "absolute inset-y-0 left-0 z-30 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:transition-none",
                navOpen ? "shadow-modal translate-x-0" : "-translate-x-full",
              )}
            >
              {sidebar}
            </div>
          </>
        )}
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}
