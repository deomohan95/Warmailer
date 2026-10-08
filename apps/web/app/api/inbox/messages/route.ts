import { NextResponse } from "next/server";

import { getActiveWorkspace, getInboxMessageTrail } from "@/lib/backend-data";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const workspace = await getActiveWorkspace();
  const params = new URL(request.url).searchParams;
  const selection = {
    threadId: params.get("threadId") ?? undefined,
    messageId: params.get("messageId") ?? undefined,
    campaignId: params.get("campaignId") ?? undefined,
    leadId: params.get("leadId") ?? undefined,
    mailboxId: params.get("mailboxId") ?? undefined,
  };
  if (!(selection.threadId || selection.messageId) || Object.values(selection).some((id) => id && !uuid.test(id))) {
    return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  }
  return NextResponse.json(await getInboxMessageTrail(workspace.workspaceId, selection));
}
