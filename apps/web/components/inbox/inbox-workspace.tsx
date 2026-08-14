"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { IconInbox } from "@/components/icons";
import { Card, EmptyState, StatusPill } from "@/components/ui/primitives";
import { formatDateTime, THREAD_STATUS } from "@/lib/labels";
import type { Campaign, InboxMessage, InboxThread, Mailbox, ThreadStatus } from "@/lib/types";

type Folder = "inbox" | "sent" | "unread" | "archived";
type SortOrder = "latest" | "oldest";
type Conversation = {
  key: string;
  thread?: InboxThread;
  message?: InboxMessage;
  mailboxId: string;
  campaignId?: string;
  leadId?: string;
  subject: string;
  fromEmail: string;
  preview: string;
  status?: ThreadStatus;
  lastAt: string;
  lastDirection: InboxMessage["direction"];
  hasInbound: boolean;
  hasOutbound: boolean;
};

const FOLDERS: { key: Folder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "unread", label: "Unread" },
  { key: "archived", label: "Archived" },
];

/** Only a known folder name may open from a URL; anything else falls back. */
function folderFromParam(value: string | undefined): Folder {
  return FOLDERS.some((item) => item.key === value) ? (value as Folder) : "inbox";
}

export function InboxWorkspace({
  threads,
  messages,
  mailboxes,
  campaigns,
  initialFolder,
}: {
  threads: InboxThread[];
  messages: InboxMessage[];
  mailboxes: Mailbox[];
  campaigns: Campaign[];
  initialFolder?: string;
}) {
  const router = useRouter();
  // Lets the dashboard link straight to the folder a figure was counted from.
  const [folder, setFolder] = useState<Folder>(() => folderFromParam(initialFolder));
  const [campaignId, setCampaignId] = useState("all");
  const [mailboxId, setMailboxId] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [selectedKey, setSelectedKey] = useState<string | null>(threads[0]?.threadId ?? null);
  const [replyBody, setReplyBody] = useState("");
  const [replyStatus, setReplyStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const conversations = useMemo(() => buildConversations(threads, messages), [threads, messages]);
  const visible = useMemo(() => {
    return conversations
      .filter((item) => inFolder(item, folder))
      .filter((item) => campaignId === "all" || item.campaignId === campaignId)
      .filter((item) => mailboxId === "all" || item.mailboxId === mailboxId)
      .sort((a, b) => {
        const diff = new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime();
        return sortOrder === "latest" ? -diff : diff;
      });
  }, [campaignId, conversations, folder, mailboxId, sortOrder]);

  const selected = visible.find((item) => item.key === selectedKey) ?? visible[0] ?? null;
  const mailbox = selected ? mailboxes.find((item) => item.mailboxId === selected.mailboxId) : undefined;
  const campaign = selected ? campaigns.find((item) => item.campaignId === selected.campaignId) : undefined;
  const conversationMessages = selected ? messages.filter((message) => belongsToConversation(message, selected)) : [];

  async function updateThreadStatus(status: ThreadStatus) {
    if (!selected?.thread) return;
    setReplyStatus(null);
    const response = await fetch("/api/inbox/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: selected.thread.threadId, status }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setReplyStatus(data.error ?? "Status update failed");
      return;
    }
    router.refresh();
  }

  if (threads.length === 0 && messages.length === 0) {
    const hasMailbox = mailboxes.length > 0;

    return (
      <Card>
        <div className="card-body card-body-flush">
          <EmptyState
            icon={<IconInbox />}
            title="No mail synced yet"
            description={
              hasMailbox
                ? "A mailbox is connected. Sent mail appears after campaigns send, and replies appear after the Zoho inbox sync worker pulls them."
                : "Connect Zoho mailboxes to receive replies here. Every reply from every mailbox lands in this one inbox."
            }
            action={
              hasMailbox ? undefined : (
                <Link href="/mailboxes" className="btn btn-primary">
                  Connect a mailbox
                </Link>
              )
            }
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="workspace-full">
      <div className="inbox-toolbar">
        <div className="tabs" role="tablist" aria-label="Mailbox folders">
          {FOLDERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={folder === item.key}
              onClick={() => {
                setFolder(item.key);
                setSelectedKey(null);
              }}
            >
              {item.label}
              <span className="tab-count">{conversations.filter((thread) => inFolder(thread, item.key)).length}</span>
            </button>
          ))}
        </div>

        <div className="filter-bar inbox-filters">
          <select className="select" aria-label="Campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
            <option value="all">All campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.campaignId} value={campaign.campaignId}>
                {campaign.name}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Mailbox" value={mailboxId} onChange={(event) => setMailboxId(event.target.value)}>
            <option value="all">All mailboxes</option>
            {mailboxes.map((mailbox) => (
              <option key={mailbox.mailboxId} value={mailbox.mailboxId}>
                {mailbox.emailAddress}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      <div className="inbox">
        <div className="thread-list">
          {visible.length === 0 ? (
            <EmptyState small title="No mail matches this view" />
          ) : (
            visible.map((item) => (
              <button
                key={item.key}
                type="button"
                className="thread-item"
                aria-current={selected?.key === item.key}
                onClick={() => setSelectedKey(item.key)}
              >
                <div className="thread-item-top">
                  {item.status === "unread" ? <span className="thread-unread" aria-hidden /> : null}
                  <span className="thread-from">{item.fromEmail}</span>
                  <span className="thread-time">{formatDateTime(item.lastAt).slice(5)}</span>
                </div>
                <div className="thread-subject">{item.subject}</div>
                <div className="thread-subject">{item.preview}</div>
              </button>
            ))
          )}
        </div>

        <div className="reading-pane">
          {selected === null ? (
            <EmptyState small title="Select a message" description="Email trails open in this pane." />
          ) : (
            <>
              <header className="pane-head">
                <div className="stack" style={{ gap: 5, minWidth: 0 }}>
                  <h2 className="pane-subject">{selected.subject}</h2>
                  <div className="pane-meta">
                    {selected.campaignId ? (
                      <Link href={`/campaigns/${selected.campaignId}`} className="action-link">
                        {campaign?.name ?? selected.campaignId}
                      </Link>
                    ) : (
                      <span>No campaign</span>
                    )}
                    <span aria-hidden>·</span>
                    <span>{mailbox?.emailAddress ?? selected.mailboxId}</span>
                    <span aria-hidden>·</span>
                    <span className="num">{formatDateTime(selected.lastAt)}</span>
                  </div>
                </div>
                <div className="row pane-actions">
                  {selected.status ? <StatusPill {...THREAD_STATUS[selected.status]} /> : <StatusPill label="Sent" tone="good" />}
                  {selected.thread ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => updateThreadStatus(selected.status === "archived" ? "read" : "archived")}
                    >
                      {selected.status === "archived" ? "Move to inbox" : "Archive"}
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="message-trail">
                {conversationMessages.length === 0 ? (
                  <div className="message-body">
                    <span>{selected.preview}</span>
                  </div>
                ) : (
                  conversationMessages.map((message) => (
                    <article
                      key={message.messageId}
                      className={
                        message.direction === "outbound" ? "message-card message-card-outbound" : "message-card message-card-inbound"
                      }
                    >
                      <div className="message-head">
                        <strong>{message.direction === "outbound" ? mailbox?.emailAddress ?? "You" : selected.fromEmail}</strong>
                        <span>{formatDateTime(message.receivedAt ?? message.sentAt ?? message.createdAt)}</span>
                      </div>
                      <div className="message-body">
                        {cleanMessageBody(message.bodyText || message.bodyPreview) || "No body saved."}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="composer">
                {selected.thread ? (
                  <>
                    <div className="composer-row">
                      <textarea
                        id="reply-body"
                        className="textarea composer-input"
                        rows={1}
                        aria-label={`Reply to ${selected.fromEmail}`}
                        placeholder="Write a reply…"
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary composer-send"
                        disabled={!replyBody.trim() || isSending}
                        onClick={async () => {
                          setIsSending(true);
                          setReplyStatus(null);
                          try {
                            const response = await fetch("/api/inbox/reply", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ threadId: selected.thread?.threadId, body: replyBody }),
                            });
                            const data = await response.json().catch(() => ({}));
                            if (!response.ok) throw new Error(data.error ?? "Reply failed");
                            setReplyBody("");
                            setReplyStatus("Reply sent.");
                            router.refresh();
                          } catch (error) {
                            setReplyStatus(error instanceof Error ? error.message : "Reply failed");
                          } finally {
                            setIsSending(false);
                          }
                        }}
                      >
                        {isSending ? "Sending…" : "Send"}
                      </button>
                    </div>
                    <div className="composer-foot">
                      <span className="subtle">
                        Sends from {mailbox ? mailbox.emailAddress : "the receiving mailbox"}, in this thread.
                      </span>
                      {replyStatus ? <span className="muted">{replyStatus}</span> : null}
                    </div>
                  </>
                ) : (
                  <p className="subtle composer-note">Reply opens when the lead replies and a thread exists.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildConversations(threads: InboxThread[], messages: InboxMessage[]): Conversation[] {
  return [
    ...threads.map((thread) => {
      const related = messages.filter((message) => belongsToThread(message, thread)).sort((a, b) => messageMs(a) - messageMs(b));
      const latest = related.at(-1);
      return {
        key: thread.threadId,
        thread,
        mailboxId: thread.mailboxId,
        campaignId: thread.campaignId,
        leadId: thread.leadId,
        subject: thread.subject,
        fromEmail: thread.fromEmail,
        preview: latest?.bodyPreview || thread.preview,
        status: thread.status,
        lastAt: latest ? messageTime(latest) : thread.lastMessageAt,
        lastDirection: latest?.direction ?? "inbound",
        hasInbound: related.some((message) => message.direction === "inbound"),
        hasOutbound: related.some((message) => message.direction === "outbound"),
      };
    }),
    ...messages
      .filter((message) => message.direction === "outbound" && !threads.some((thread) => belongsToThread(message, thread)))
      .map((message) => ({
        key: `sent:${message.messageId}`,
        message,
        mailboxId: message.mailboxId,
        campaignId: message.campaignId,
        leadId: message.leadId,
        subject: message.subject,
        fromEmail: "You",
        preview: message.bodyPreview,
        lastAt: messageTime(message),
        lastDirection: "outbound" as const,
        hasInbound: false,
        hasOutbound: true,
      })),
  ];
}

function inFolder(item: Conversation, folder: Folder) {
  if (folder === "sent") return item.hasOutbound;
  if (folder === "unread") return item.status === "unread";
  if (folder === "archived") return item.status === "archived";
  return item.thread && item.hasInbound && item.status !== "archived";
}

function belongsToConversation(message: InboxMessage, item: Conversation) {
  if (item.thread) return belongsToThread(message, item.thread);
  if (item.message?.messageId === message.messageId) return true;
  return false;
}

function belongsToThread(message: InboxMessage, thread: InboxThread) {
  if (message.threadId === thread.threadId) return true;
  return Boolean(
    thread.campaignId &&
      thread.leadId &&
      message.campaignId === thread.campaignId &&
      message.leadId === thread.leadId &&
      message.mailboxId === thread.mailboxId,
  );
}

function messageTime(message: InboxMessage) {
  return message.receivedAt ?? message.sentAt ?? message.createdAt;
}

function messageMs(message: InboxMessage) {
  return new Date(messageTime(message)).getTime();
}

function cleanMessageBody(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const quotedReplyStart = /\nOn .+ wrote:\n/s;
  const quotedBlockStart = /\n>/;
  const firstQuote = [normalized.search(quotedReplyStart), normalized.search(quotedBlockStart)]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return (firstQuote === undefined ? normalized : normalized.slice(0, firstQuote)).trim();
}
