import { NextResponse } from "next/server";

import { getActiveWorkspace } from "@/lib/backend-data";
import { getLeadPage, getLeadStats } from "@/lib/lead-pages";

export async function GET(request: Request) {
  const workspace = await getActiveWorkspace();
  const params = new URL(request.url).searchParams;
  const importId = params.get("importId") ?? undefined;
  if (params.get("statsOnly") === "1") {
    return NextResponse.json(await getLeadStats(workspace.workspaceId, importId));
  }
  const filters = {
    search: params.get("search") ?? undefined,
    status: params.get("status") ?? undefined,
    industry: params.get("industry") ?? undefined,
    location: params.get("location") ?? undefined,
    importId,
  };
  return NextResponse.json(await getLeadPage(workspace.workspaceId, filters, Number(params.get("page") ?? 1)));
}
