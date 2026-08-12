import { z } from "zod";

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member"]);

export const EmailStatusSchema = z.enum(["not_enriched", "queued", "processing", "found", "not_found", "failed"]);

export const MailboxStatusSchema = z.enum(["not_connected", "connected", "warming", "sending_paused", "error"]);

export const ZohoRegionSchema = z.enum(["us", "eu", "in", "au"]);

export const CampaignStatusSchema = z.enum([
  "draft",
  "scheduled",
  "sending",
  "paused",
  "completed",
  "failed",
]);

export const MessageDirectionSchema = z.enum(["inbound", "outbound"]);

export const MessageEventTypeSchema = z.enum([
  "queued",
  "smtp_accepted",
  "delivery_unknown",
  "open",
  "click",
  "reply",
  "bounce",
  "unsubscribe",
  "failed",
  "suppressed",
]);

const TimeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const MailboxCreateInputSchema = z
  .object({
    emailAddress: z.string().trim().email().transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(1).max(120).optional(),
    appPassword: z.string().min(1),
    zohoRegion: ZohoRegionSchema.default("us"),
    dailyHardLimit: z.number().int().min(1).max(500),
    hourlyHardLimit: z.number().int().min(1).max(100),
    sendingWindowStart: TimeOfDaySchema.default("09:00"),
    sendingWindowEnd: TimeOfDaySchema.default("17:00"),
    timezone: z.string().trim().min(1).default("UTC"),
  })
  .strict();

export const LeadListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    emailStatus: EmailStatusSchema.optional(),
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(120).optional(),
    cursor: z.string().min(1).optional(),
    pageSize: z.number().int().min(1).max(500).default(100),
  })
  .strict();

const CountSchema = z.number().int().min(0);

export const DashboardOverviewSchema = z
  .object({
    workspaceId: z.string().min(1),
    importedCount: CountSchema,
    emailFoundCount: CountSchema,
    enrichmentEligibleCount: CountSchema,
    connectedMailboxCount: CountSchema,
    sendCapacityToday: CountSchema,
    activeCampaignCount: CountSchema,
    unreadThreadCount: CountSchema,
  })
  .strict();

const ExplicitLeadSelectionSchema = z
  .object({
    leadIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

const FilterLeadSelectionSchema = z
  .object({
    filterToken: z.string().min(1),
    excludedLeadIds: z.array(z.string().min(1)),
  })
  .strict();

export const LeadSelectionSchema = z.union([ExplicitLeadSelectionSchema, FilterLeadSelectionSchema]);

const CampaignScheduleInputSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sendingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    windowStart: TimeOfDaySchema,
    windowEnd: TimeOfDaySchema,
    perMailboxDelaySeconds: z.number().int().min(0),
    maxSendsPerDay: z.number().int().min(1),
  })
  .strict();

const CampaignSequenceStepInputSchema = z
  .object({
    subject: z.string().trim().max(300),
    body: z.string().trim().min(1),
    delayDays: z.number().int().min(0),
  })
  .strict();

export const CampaignCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    timezone: z.string().trim().min(1),
    leadIds: z.array(z.string().min(1)).min(1),
    mailboxIds: z.array(z.string().min(1)).min(1),
    sequence: z.array(CampaignSequenceStepInputSchema).min(1),
    schedule: CampaignScheduleInputSchema,
  })
  .strict();

export const CampaignListItemSchema = z
  .object({
    campaignId: z.string().min(1),
    workspaceId: z.string().min(1),
    name: z.string().min(1),
    status: CampaignStatusSchema,
    selectedLeadCount: CountSchema,
    selectedMailboxCount: CountSchema,
    dailyCapacity: CountSchema,
    lastActivityAt: z.string().nullable(),
  })
  .strict();

export const ThreadStatusSchema = z.enum(["unread", "read", "replied", "archived"]);

export const InboxThreadListItemSchema = z
  .object({
    threadId: z.string().min(1),
    workspaceId: z.string().min(1),
    mailboxId: z.string().min(1),
    leadId: z.string().min(1).nullable().optional(),
    campaignId: z.string().min(1).nullable().optional(),
    messageId: z.string().min(1).nullable().optional(),
    fromEmail: z.string().email(),
    subject: z.string(),
    lastMessageAt: z.string(),
    status: ThreadStatusSchema,
    preview: z.string(),
  })
  .strict();

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type EmailStatus = z.infer<typeof EmailStatusSchema>;
export type MailboxStatus = z.infer<typeof MailboxStatusSchema>;
export type ZohoRegion = z.infer<typeof ZohoRegionSchema>;
export type MailboxCreateInput = z.infer<typeof MailboxCreateInputSchema>;
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;
export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>;
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;
export type MessageEventType = z.infer<typeof MessageEventTypeSchema>;
export type LeadSelection = z.infer<typeof LeadSelectionSchema>;
export type CampaignCreateInput = z.infer<typeof CampaignCreateInputSchema>;
export type CampaignListItem = z.infer<typeof CampaignListItemSchema>;
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;
export type InboxThreadListItem = z.infer<typeof InboxThreadListItemSchema>;
