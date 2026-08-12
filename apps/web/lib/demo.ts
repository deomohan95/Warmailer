import type {
  Campaign,
  CampaignActivity,
  CampaignSchedule,
  InboxThread,
  Lead,
  LeadImport,
  Mailbox,
  SequenceStep,
} from "@/lib/types";
import { ACTIVE_WORKSPACE } from "./workspace";

/**
 * Layout fixtures. The app ships with these OFF — the real default state is
 * empty, because Warmailer must never present invented sending performance as
 * if it were this workspace's numbers.
 *
 * Flip to `true` only to inspect populated layouts. Every record below is
 * obviously seeded (`seed_*` ids, example.com addresses) and carries the same
 * lineage fields the backend will supply.
 */
export const demoMode = false;

const WS = ACTIVE_WORKSPACE.workspaceId;
const T0 = "2026-08-10T09:00:00.000Z";
const T1 = "2026-08-12T09:00:00.000Z";

export const seedImports: LeadImport[] = [
  {
    workspaceId: WS,
    source: "apollo_csv",
    entityId: "seed_import_1",
    importId: "seed_import_1",
    createdAt: T0,
    updatedAt: T0,
    fileName: "apollo-fintech-uk.csv",
    rowCount: 1840,
    importedCount: 1792,
    duplicateCount: 48,
    status: "completed",
  },
];

export const seedLeads: Lead[] = [
  {
    workspaceId: WS,
    source: "apollo_csv",
    entityId: "seed_lead_1",
    leadId: "seed_lead_1",
    importId: "seed_import_1",
    enrichmentBatchId: "seed_batch_1",
    createdAt: T0,
    updatedAt: T1,
    name: "Priya Raman",
    jobTitle: "Head of Operations",
    company: "Northwind Systems",
    link: "https://example.com/company/northwind",
    location: "Manchester, UK",
    employees: "51-200",
    industry: "Logistics",
    email: "priya@example.com",
    emailStatus: "email_found",
    sourceFile: "apollo-fintech-uk.csv",
  },
  {
    workspaceId: WS,
    source: "apollo_csv",
    entityId: "seed_lead_2",
    leadId: "seed_lead_2",
    importId: "seed_import_1",
    enrichmentBatchId: "seed_batch_1",
    createdAt: T0,
    updatedAt: T1,
    name: "Tomas Lindqvist",
    jobTitle: "VP Finance",
    company: "Aurora Labs",
    link: "https://example.com/company/aurora",
    location: "Stockholm, SE",
    employees: "201-500",
    industry: "Software",
    emailStatus: "processing",
    sourceFile: "apollo-fintech-uk.csv",
  },
  {
    workspaceId: WS,
    source: "apollo_csv",
    entityId: "seed_lead_3",
    leadId: "seed_lead_3",
    importId: "seed_import_1",
    createdAt: T0,
    updatedAt: T0,
    name: "Amara Okafor",
    jobTitle: "Procurement Lead",
    company: "Meridian Freight",
    link: "https://example.com/company/meridian",
    location: "Lagos, NG",
    employees: "1001-5000",
    industry: "Logistics",
    emailStatus: "not_enriched",
    sourceFile: "apollo-fintech-uk.csv",
  },
  {
    workspaceId: WS,
    source: "apify_fallback",
    entityId: "seed_lead_4",
    leadId: "seed_lead_4",
    importId: "seed_import_1",
    enrichmentBatchId: "seed_batch_2",
    createdAt: T0,
    updatedAt: T1,
    name: "Daniel Weiss",
    jobTitle: "Chief Technology Officer",
    company: "Kestrel Analytics",
    link: "https://example.com/company/kestrel",
    location: "Berlin, DE",
    employees: "11-50",
    industry: "Data",
    emailStatus: "not_found",
    sourceFile: "apollo-fintech-uk.csv",
  },
  {
    workspaceId: WS,
    source: "apify_primary",
    entityId: "seed_lead_5",
    leadId: "seed_lead_5",
    importId: "seed_import_1",
    enrichmentBatchId: "seed_batch_1",
    campaignId: "seed_campaign_1",
    createdAt: T0,
    updatedAt: T1,
    name: "Elena Duarte",
    jobTitle: "Operations Director",
    company: "Harbour Point Logistics",
    link: "https://example.com/company/harbourpoint",
    location: "Lisbon, PT",
    employees: "501-1000",
    industry: "Logistics",
    email: "elena@example.com",
    emailStatus: "email_found",
    sourceFile: "apollo-fintech-uk.csv",
    activeCampaignId: "seed_campaign_1",
  },
];

export const seedMailboxes: Mailbox[] = [
  {
    workspaceId: WS,
    source: "zoho_mail",
    entityId: "seed_mailbox_1",
    mailboxId: "seed_mailbox_1",
    createdAt: T0,
    updatedAt: T1,
    emailAddress: "dave@example.com",
    displayName: "Dave at Warmailer",
    status: "connected",
    dailyHardLimit: 120,
    hourlyHardLimit: 20,
    usedToday: 34,
    reservedToday: 10,
    availableToday: 76,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:30",
    timezone: "Europe/London",
    appPasswordConfigured: true,
  },
  {
    workspaceId: WS,
    source: "zoho_mail",
    entityId: "seed_mailbox_2",
    mailboxId: "seed_mailbox_2",
    createdAt: T0,
    updatedAt: T1,
    emailAddress: "outreach@example.com",
    displayName: "Outreach",
    status: "sending_paused",
    dailyHardLimit: 80,
    hourlyHardLimit: 12,
    usedToday: 0,
    reservedToday: 0,
    availableToday: 80,
    sendingWindowStart: "08:00",
    sendingWindowEnd: "16:00",
    timezone: "Europe/London",
    appPasswordConfigured: true,
  },
];

const seedSequence: SequenceStep[] = [
  {
    stepId: "seed_step_1",
    subject: "Freight routing at {{company}}",
    body: "Hi {{first_name}},\n\nNoticed {{company}} runs its own routing desk. Worth a short look at where the spend sits?\n\nDave",
    delayDays: 0,
  },
  {
    stepId: "seed_step_2",
    subject: "Re: Freight routing at {{company}}",
    body: "Hi {{first_name}},\n\nBumping this once in case it landed at a bad moment.\n\nDave",
    delayDays: 3,
  },
];

const seedSchedule: CampaignSchedule = {
  startDate: "2026-08-10",
  sendingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
  perMailboxDelaySeconds: 90,
  maxSendsPerDay: 60,
  timezone: "Europe/London",
};

export const seedCampaigns: Campaign[] = [
  {
    workspaceId: WS,
    source: "user_action",
    entityId: "seed_campaign_1",
    campaignId: "seed_campaign_1",
    createdAt: T0,
    updatedAt: T1,
    name: "Logistics Q3 — operations leads",
    status: "sending",
    selectedLeadCount: 420,
    selectedMailboxCount: 1,
    dailyCapacity: 76,
    lastActivityAt: T1,
    mailboxIds: ["seed_mailbox_1"],
    sequence: seedSequence,
    schedule: seedSchedule,
  },
  {
    workspaceId: WS,
    source: "user_action",
    entityId: "seed_campaign_2",
    campaignId: "seed_campaign_2",
    createdAt: T0,
    updatedAt: T0,
    name: "Fintech founders — intro",
    status: "draft",
    selectedLeadCount: 0,
    selectedMailboxCount: 0,
    dailyCapacity: 0,
    lastActivityAt: null,
    mailboxIds: [],
    sequence: [],
    schedule: { ...seedSchedule, startDate: "", maxSendsPerDay: 0 },
  },
];

export const seedActivity: CampaignActivity[] = [
  {
    workspaceId: WS,
    source: "system",
    entityId: "seed_event_1",
    campaignId: "seed_campaign_1",
    leadId: "seed_lead_1",
    mailboxId: "seed_mailbox_1",
    messageId: "seed_message_1",
    createdAt: T1,
    updatedAt: T1,
    eventType: "sent",
    occurredAt: T1,
  },
  {
    workspaceId: WS,
    source: "zoho_mail",
    entityId: "seed_event_2",
    campaignId: "seed_campaign_1",
    leadId: "seed_lead_1",
    mailboxId: "seed_mailbox_1",
    messageId: "seed_message_2",
    createdAt: T1,
    updatedAt: T1,
    eventType: "replied",
    occurredAt: T1,
  },
];

export const seedThreads: InboxThread[] = [
  {
    workspaceId: WS,
    source: "zoho_mail",
    entityId: "seed_thread_1",
    threadId: "seed_thread_1",
    mailboxId: "seed_mailbox_1",
    leadId: "seed_lead_1",
    campaignId: "seed_campaign_1",
    messageId: "seed_message_2",
    createdAt: T1,
    updatedAt: T1,
    fromEmail: "priya@example.com",
    subject: "Re: Freight routing at Northwind",
    lastMessageAt: T1,
    status: "unread",
    preview: "Happy to take a look — can you send over the routing numbers before Thursday?",
  },
];

/** A new campaign starts with one email and a conservative sending window. */
export const emptySequence: SequenceStep[] = [
  { stepId: "step_1", subject: "", body: "", delayDays: 0 },
];

export const defaultSchedule: CampaignSchedule = {
  startDate: "",
  sendingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
  perMailboxDelaySeconds: 90,
  maxSendsPerDay: 0,
  timezone: "Europe/London",
};

/** Every seeded record, for the lineage invariant test. */
export const allSeedRecords = [
  ...seedImports,
  ...seedLeads,
  ...seedMailboxes,
  ...seedCampaigns,
  ...seedActivity,
  ...seedThreads,
];

export const leads: Lead[] = demoMode ? seedLeads : [];
export const leadImports: LeadImport[] = demoMode ? seedImports : [];
export const mailboxes: Mailbox[] = demoMode ? seedMailboxes : [];
export const campaigns: Campaign[] = demoMode ? seedCampaigns : [];
export const campaignActivity: CampaignActivity[] = demoMode ? seedActivity : [];
export const threads: InboxThread[] = demoMode ? seedThreads : [];
