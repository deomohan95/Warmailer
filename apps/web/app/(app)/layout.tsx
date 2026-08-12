import { AppShell } from "@/components/shell/app-shell";
import { getActiveWorkspace } from "@/lib/backend-data";

export const dynamic = "force-dynamic";

/**
 * Session, profile and workspace membership are resolved once here when the
 * backend is wired, and passed down. Pages must not repeat that lookup —
 * duplicating it across proxy, layout and page is what made the previous owner
 * pages take one to two seconds per navigation.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getActiveWorkspace();
  return <AppShell workspace={workspace}>{children}</AppShell>;
}
