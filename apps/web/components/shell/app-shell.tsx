"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  IconCampaigns,
  IconDashboard,
  IconInbox,
  IconLeads,
  IconMailbox,
  IconMenu,
  IconSearch,
  IconSettings,
} from "@/components/icons";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { activeNavKey, NAV_ITEMS, type NavKey } from "@/lib/nav";
import { ACTIVE_WORKSPACE } from "@/lib/workspace";

const NAV_ICONS: Record<NavKey, (props: { size?: number; className?: string }) => React.ReactElement> = {
  dashboard: IconDashboard,
  leads: IconLeads,
  campaigns: IconCampaigns,
  inbox: IconInbox,
  mailboxes: IconMailbox,
  settings: IconSettings,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeNavKey(pathname);
  const [navOpen, setNavOpen] = useState(false);

  // A route change on mobile should dismiss the overlay rail.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="shell" data-nav-open={navOpen}>
      <aside className="rail">
        <div className="rail-brand">
          <span className="rail-mark" aria-hidden>
            <IconCampaigns size={14} />
          </span>
          <span className="rail-wordmark">Warmailer</span>
        </div>

        <nav className="rail-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="rail-link"
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="rail-icon" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rail-foot">Sending is capped by connected mailbox hard limits.</div>
      </aside>

      {navOpen ? (
        <button
          type="button"
          className="rail-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn nav-toggle"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <IconMenu />
          </button>

          <button type="button" className="workspace-chip">
            <span className="workspace-avatar" aria-hidden>
              {initials(ACTIVE_WORKSPACE.name)}
            </span>
            {ACTIVE_WORKSPACE.name}
          </button>

          <div className="topbar-search">
            <IconSearch />
            <input type="search" placeholder="Search leads, campaigns, replies" disabled />
          </div>

          <div className="spacer" />
          <ThemeToggle />
          <button type="button" className="user-chip" aria-label="Account menu">
            {ACTIVE_WORKSPACE.userInitials}
          </button>
        </header>

        {children}
      </div>
    </div>
  );
}
