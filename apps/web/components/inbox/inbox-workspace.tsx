"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { IconInbox, IconLock } from "@/components/icons";
import { Card, EmptyState, StatusPill } from "@/components/ui/primitives";
import { formatDateTime, THREAD_STATUS } from "@/lib/labels";
import type { InboxThread, Mailbox, ThreadStatus } from "@/lib/types";

/**
 * Filters mirror `ThreadStatus` exactly. Reply classification (positive, out of
 * office, bounce) is not filtered here because nothing on the record carries a
 * classification yet — offering the tab would imply a feature that does not exist.
 */
const FILTERS: { key: ThreadStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "replied", label: "Replied" },
  { key: "archived", label: "Archived" },
];

export function InboxWorkspace({ threads, mailboxes }: { threads: InboxThread[]; mailboxes: Mailbox[] }) {
  const [filter, setFilter] = useState<ThreadStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(threads[0]?.threadId ?? null);

  const visible = useMemo(
    () => (filter === "all" ? threads : threads.filter((thread) => thread.status === filter)),
    [threads, filter],
  );

  const selected = visible.find((thread) => thread.threadId === selectedId) ?? visible[0] ?? null;
  const mailbox = selected ? mailboxes.find((item) => item.mailboxId === selected.mailboxId) : undefined;

  if (threads.length === 0) {
    const hasMailbox = mailboxes.length > 0;

    return (
      <Card>
        <div className="card-body card-body-flush">
          <EmptyState
            icon={<IconInbox />}
            title="No replies synced yet"
            description={
              hasMailbox
                ? "A mailbox is connected. Replies will appear here after the Zoho inbox sync worker is wired and has pulled messages."
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
    <Card>
      <div className="filter-bar">
        <div className="tabs" style={{ border: 0 }} role="tablist" aria-label="Filter replies">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span className="tab-count">
                {item.key === "all" ? threads.length : threads.filter((t) => t.status === item.key).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="inbox">
        <div className="thread-list">
          {visible.length === 0 ? (
            <EmptyState small title="No threads match this filter" />
          ) : (
            visible.map((thread) => (
              <button
                key={thread.threadId}
                type="button"
                className="thread-item"
                aria-current={selected?.threadId === thread.threadId}
                onClick={() => setSelectedId(thread.threadId)}
              >
                <div className="thread-item-top">
                  {thread.status === "unread" ? <span className="thread-unread" aria-hidden /> : null}
                  <span className="thread-from">{thread.fromEmail}</span>
                  <span className="thread-time">{formatDateTime(thread.lastMessageAt).slice(5)}</span>
                </div>
                <div className="thread-subject">{thread.subject}</div>
              </button>
            ))
          )}
        </div>

        <div className="reading-pane">
          {selected === null ? (
            <EmptyState small title="Select a thread" description="Reply threads open in this pane." />
          ) : (
            <div className="stack" style={{ gap: "var(--s-4)", padding: "var(--s-4)" }}>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ gap: "var(--s-2)" }}>
                  <h2 style={{ fontSize: 16 }}>{selected.subject}</h2>
                  <StatusPill {...THREAD_STATUS[selected.status]} />
                </div>
                <div className="subtle" style={{ fontSize: 12.5 }}>
                  {selected.fromEmail} · {formatDateTime(selected.lastMessageAt)}
                </div>
              </div>

              <div className="message-body">{selected.preview}</div>

              <dl className="lead-context">
                <dt>Received by</dt>
                <dd>{mailbox ? mailbox.emailAddress : selected.mailboxId}</dd>
                <dt>Lead</dt>
                <dd>
                  {selected.leadId ? (
                    <Link href="/leads" className="action-link" style={{ fontSize: 12.5 }}>
                      {selected.leadId}
                    </Link>
                  ) : (
                    <span className="subtle">Not matched to a lead</span>
                  )}
                </dd>
                <dt>Campaign</dt>
                <dd>
                  {selected.campaignId ? (
                    <Link
                      href={`/campaigns/${selected.campaignId}`}
                      className="action-link"
                      style={{ fontSize: 12.5 }}
                    >
                      {selected.campaignId}
                    </Link>
                  ) : (
                    <span className="subtle">Not from a campaign</span>
                  )}
                </dd>
                <dt>Message</dt>
                <dd>{selected.messageId ?? <span className="subtle">—</span>}</dd>
              </dl>

              <div className="stack" style={{ gap: "var(--s-2)" }}>
                <label htmlFor="reply-body" className="field-hint">
                  Reply from {mailbox ? mailbox.emailAddress : "the receiving mailbox"}
                </label>
                <textarea
                  id="reply-body"
                  className="textarea"
                  style={{ minHeight: 96 }}
                  placeholder="Replying is not wired to Zoho yet."
                  disabled
                />
                <div className="row" style={{ gap: "var(--s-2)" }}>
                  <button type="button" className="btn btn-primary" disabled>
                    Send reply
                  </button>
                  <span className="subtle row" style={{ gap: 5, fontSize: 12.5 }}>
                    <IconLock size={13} />
                    Sending replies is disabled until the mail worker is connected.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
