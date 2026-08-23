"use client";

import type { ReactNode } from "react";
import type { Credits } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        credits={credits}
        userEmail={userEmail}
      />
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </div>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}
