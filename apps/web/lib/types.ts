/**
 * Frontend record shapes. Every visible entity carries lineage so any item on
 * screen can answer: where did this come from, which workspace owns it, which
 * lead/campaign/mailbox/message does it belong to.
 *
 * These mirror `@warmailer/contracts` but are not identical yet — the contracts
 * package uses `found`/`not_found` for email status and `active`/`stopped` for
 * campaign status, while the frontend spec uses `email_found` and
 * `sending`/`failed`. Reconcile at the wiring gate, not before.
 */

export type WorkspaceRole = "owner" | "admin" | "member";

export type LineageSource =
  | "apollo_csv"
  | "apify_primary"
  | "apify_fallback"
  | "zoho_mail"
  | "user_action"
  | "system";

export type EntityLineage = {
  workspaceId: string;
  source: LineageSource;
  entityId: string;
  leadId?: string;
  campaignId?: string;
  mailboxId?: string;
  importId?: string;
  enrichmentBatchId?: string;
  messageId?: string;
  createdAt: string;
  updatedAt: string;
};

/* ---------- Leads ---------- */

export type LeadStatus =
  | "not_enriched"
  | "queued"
  | "processing"
  | "email_found"
  | "not_found"
  | "failed"
  | "suppressed";

/** Column order of the Apollo export accepted by the CSV importer. */
export const LEAD_CSV_HEADER =
  "source_file,name,job_title,company,link,location,employees,industry";

export type Lead = EntityLineage & {
  leadId: string;
  name: string;
  jobTitle: string;
  company: string;
  link: string;
  location: string;
  employees: string;
  industry: string;
  email?: string;
  emailStatus: LeadStatus;
  sourceFile: string;
  importIds?: string[];
  /** Set while a lead is enrolled in a running campaign; such leads are skipped. */
  activeCampaignId?: string;
};

export type LeadImport = EntityLineage & {
  importId: string;
  fileName: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  status: "pending" | "importing" | "completed" | "failed";
};

/* ---------- Mailboxes ---------- */

export type MailboxStatus = "not_connected" | "connected" | "warming" | "sending_paused" | "error";

/**
 * The capacity shape. Dashboard, campaign builder and campaign detail all read
 * this — no page defines its own capacity maths.
 */
export type MailboxCapacity = {
  mailboxId: string;
  emailAddress: string;
  status: MailboxStatus;
  dailyHardLimit: number;
  hourlyHardLimit: number;
  usedToday: number;
  reservedToday: number;
  availableToday: number;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  timezone: string;
};

/**
 * A stored mailbox never carries its app password. The secret is write-only:
 * it is submitted once and the UI only ever learns whether one is configured.
 */
export type Mailbox = EntityLineage &
  MailboxCapacity & {
    displayName: string;
    appPasswordConfigured: boolean;
  };

export type WarmupMailboxStats = EntityLineage & {
  mailboxId: string;
  emailAddress: string;
  warmupEnabled: boolean;
  warmupDailyLimit: number;
  warmupDailyRampup: number;
  warmupRandomizeDailyCount: boolean;
  warmupReplyRatePercent: number;
  warmupStartedAt?: string;
  sent7d: number;
  inbox7d: number;
  spam7d: number;
  savedFromSpam7d: number;
  replied7d: number;
  reputation: number;
};

export type WarmupSeedAccount = EntityLineage & {
  seedAccountId: string;
  provider: "gmail";
  emailAddress: string;
  status: "connected" | "disabled" | "error";
  lastCheckedAt?: string;
};

/* ---------- Campaigns ---------- */

export type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "completed" | "failed";

export type SequenceStep = {
  stepId: string;
  subject: string;
  body: string;
  delayDays: number;
};

export type CampaignSchedule = {
  startDate: string;
  sendingDays: number[];
  windowStart: string;
  windowEnd: string;
  perMailboxDelaySeconds: number;
  maxSendsPerDay: number;
  timezone: string;
};

export type Campaign = EntityLineage & {
  campaignId: string;
  name: string;
  status: CampaignStatus;
  selectedLeadCount: number;
  selectedMailboxCount: number;
  dailyCapacity: number;
  lastActivityAt: string | null;
  /**
   * The lead set is an aggregate count on the list, but the mailbox set is small
   * and always carried: campaign detail recomputes live capacity from it rather
   * than trusting the stored `dailyCapacity` snapshot.
   */
  mailboxIds: string[];
  sequence: SequenceStep[];
  schedule: CampaignSchedule;
};

export type CampaignEventType =
  | "scheduled"
  | "sent"
  | "delivered"
  | "opened"
  | "replied"
  | "bounced"
  | "paused"
  | "resumed"
  | "stopped";

export type CampaignActivity = EntityLineage & {
  eventType: CampaignEventType;
  occurredAt: string;
};

/* ---------- Inbox ---------- */

export type ThreadStatus = "unread" | "read" | "replied" | "archived";

export type InboxThread = EntityLineage & {
  threadId: string;
  mailboxId: string;
  leadId?: string;
  campaignId?: string;
  fromEmail: string;
  subject: string;
  lastMessageAt: string;
  status: ThreadStatus;
  preview: string;
};

export type InboxMessage = EntityLineage & {
  threadId?: string;
  mailboxId: string;
  leadId?: string;
  campaignId?: string;
  direction: "inbound" | "outbound";
  subject: string;
  bodyText: string;
  bodyPreview: string;
  sentAt?: string;
  receivedAt?: string;
};
