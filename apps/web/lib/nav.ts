/**
 * The sidebar is exactly these six modules. Imports, enrichment, new campaign,
 * campaign detail, team, billing and warmup are nested flows inside them and
 * must never become top-level navigation.
 */

export type NavKey = "dashboard" | "leads" | "campaigns" | "inbox" | "mailboxes" | "settings";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "leads", label: "Leads", href: "/leads" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
  { key: "inbox", label: "Inbox", href: "/inbox" },
  { key: "mailboxes", label: "Mailboxes", href: "/mailboxes" },
  { key: "settings", label: "Settings", href: "/settings" },
] as const;

/** Nested routes resolve to their parent module so the rail stays highlighted. */
export function activeNavKey(pathname: string): NavKey {
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/leads")) return "leads";
  if (pathname.startsWith("/campaigns")) return "campaigns";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/mailboxes")) return "mailboxes";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}
