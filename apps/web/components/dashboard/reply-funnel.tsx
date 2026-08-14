import Link from "next/link";

import { IconArrowRight } from "@/components/icons";
import { EmptyState } from "@/components/ui/primitives";
import { formatRate, funnelStages, type FunnelCounts } from "@/lib/metrics";

/**
 * Sent → Opened → Replied, each bar a share of sends.
 *
 * Series colours are the same three validated hues as the daily chart, so a
 * stage keeps its identity across the dashboard — colour follows the entity,
 * never its position in a list.
 */
export function ReplyFunnel({ counts, inboxHref }: { counts: FunnelCounts; inboxHref: string }) {
  const stages = funnelStages(counts);

  if (counts.sent === 0) {
    return (
      <EmptyState
        small
        title="No sends recorded yet"
        description="The funnel fills in as the mail worker records sends, opens and replies."
      />
    );
  }

  return (
    <div className="chart funnel">
      {stages.map((stage) => (
        <div key={stage.key} className="funnel-stage">
          <div className="funnel-head">
            <span className="funnel-label">{stage.label}</span>
            <span className="funnel-count num">{stage.count.toLocaleString()}</span>
          </div>

          <div className="funnel-track">
            <div
              className={`funnel-fill funnel-fill-${stage.key}`}
              style={{ width: `${(stage.share ?? 0) * 100}%` }}
            />
          </div>

          {stage.ofPrevious === null ? null : (
            <div className="funnel-foot">
              <strong>{formatRate(stage.ofPrevious)}</strong> of {stage.previousLabel}
              {/* The reply row also carries its share of sends, so both denominators are visible. */}
              {stage.key === "replied" ? (
                <span className="subtle"> · {formatRate(stage.share)} of sent</span>
              ) : null}
            </div>
          )}
        </div>
      ))}

      <Link href={inboxHref} className="action-link funnel-link">
        Open replies in the master inbox <IconArrowRight />
      </Link>
    </div>
  );
}
