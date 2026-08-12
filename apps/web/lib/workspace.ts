import type { WorkspaceRole } from "@/lib/types";

/**
 * Every page renders inside a workspace. Nothing in the frontend may assume a
 * single tenant — this is the one place the active workspace is resolved, and
 * once Supabase is wired it resolves server-side in the route-group layout and
 * is passed down. Pages must not re-run the lookup.
 */
export type ActiveWorkspace = {
  workspaceId: string;
  name: string;
  role: WorkspaceRole;
  userInitials: string;
};

export const ACTIVE_WORKSPACE: ActiveWorkspace = {
  workspaceId: "ws_pending_backend",
  name: "No workspace selected",
  role: "owner",
  userInitials: "—",
};
