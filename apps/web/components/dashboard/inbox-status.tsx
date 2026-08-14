import Link from "next/link";

import { IconArrowRight } from "@/components/icons";
import { EmptyState } from "@/components/ui/primitives";
import { awaitingReply, threadStatusCounts } from "@/lib/metrics";
import type { InboxThread, ThreadStatus } from "@/lib/types";

/**
 * What is still waiting on a human.
 *
 * Deliberately not painted with the reserved good/warning/critical status
 * colours: an unanswered reply is queued work, not an error. Instead the thing
 * needing attention takes the accent and everything handled goes recessive, so
 * the loud part of the bar is the part you still have to do.
 */

/** Each status backtracks to the Inbox folder that lists exactly those threads. */
const FOLDER_FOR_STATUS: Record<ThreadStatus, string> = {
  unread: "unread",
  read: "inbox",
  replied: "inbox",
  archived: "archived",
};

export function InboxStatus({ threads }: { threads: InboxThread[] }) {
  const counts = threadStatusCounts(threads);
  const waiting = awaitingReply(threads);

  if (threads.length === 0) {
    return (
      <EmptyState
        small
        title="No reply threads yet"
        description="Replies from every connected mailbox land here once the inbox sync worker pulls them."
        action={
          <Link href="/inbox" className="btn btn-secondary">
            Open inbox
          </Link>
        }
      />
    );
  }

  return (
    <div className="inbox-status">
      <div className="waiting">
        <span className="waiting-value">{waiting.toLocaleString()}</span>
        <span className="waiting-label">
          thread{waiting === 1 ? "" : "s"} waiting on you, of {threads.length.toLocaleString()}
        </span>
      </div>

      {/* 2px surface gaps separate the segments — never a stroke around them. */}
      <div className="status-bar" role="img" aria-label={counts.map((c) => `${c.count} ${c.label}`).join(", ")}>
        {counts
          .filter((entry) => entry.count > 0)
          .map((entry) => (
            <div
              key={entry.status}
              className={`status-seg status-seg-${entry.status}`}
              style={{ flexGrow: entry.count }}
            />
          ))}
      </div>

      <div className="status-keys">
        {counts.map((entry) => (
          <Link
            key={entry.status}
            href={`/inbox?folder=${FOLDER_FOR_STATUS[entry.status]}`}
            className="status-key"
            data-empty={entry.count === 0}
          >
            <span className={`status-dot status-seg-${entry.status}`} aria-hidden />
            <span className="num">{entry.count.toLocaleString()}</span>
            {entry.label}
          </Link>
        ))}
      </div>

      <Link href="/inbox?folder=unread" className="action-link">
        Go to unread <IconArrowRight />
      </Link>
    </div>
  );
}
