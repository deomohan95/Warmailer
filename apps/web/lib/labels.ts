import type { CampaignStatus, LeadStatus, MailboxStatus, ThreadStatus } from "@/lib/types";

/** Status is never colour alone — every state resolves to a written label. */
export type Tone = "neutral" | "good" | "warning" | "critical" | "accent";

export type StatusDescriptor = {
  label: string;
  tone: Tone;
};

export const LEAD_STATUS: Record<LeadStatus, StatusDescriptor> = {
  not_enriched: { label: "Not enriched", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  processing: { label: "Processing", tone: "accent" },
  email_found: { label: "Email found", tone: "good" },
  not_found: { label: "Not found", tone: "warning" },
  failed: { label: "Failed", tone: "critical" },
  suppressed: { label: "Suppressed", tone: "critical" },
};

export const MAILBOX_STATUS: Record<MailboxStatus, StatusDescriptor> = {
  not_connected: { label: "Not connected", tone: "neutral" },
  connected: { label: "Connected", tone: "good" },
  warming: { label: "Warming", tone: "accent" },
  sending_paused: { label: "Sending paused", tone: "warning" },
  error: { label: "Error", tone: "critical" },
};

export const CAMPAIGN_STATUS: Record<CampaignStatus, StatusDescriptor> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "accent" },
  sending: { label: "Sending", tone: "good" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  failed: { label: "Failed", tone: "critical" },
};

export const THREAD_STATUS: Record<ThreadStatus, StatusDescriptor> = {
  unread: { label: "Unread", tone: "accent" },
  read: { label: "Read", tone: "neutral" },
  replied: { label: "Replied", tone: "good" },
  archived: { label: "Archived", tone: "neutral" },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatSendingDays(days: readonly number[]): string {
  if (days.length === 0) return "No days selected";
  if (days.length === 7) return "Every day";
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => DAY_NAMES[day] ?? "?")
    .join(", ");
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 16).replace("T", " ");
}
