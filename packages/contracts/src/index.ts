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

export const CampaignStatusSchema = z.enum([
  "draft",
  "scheduled",
  "active",
  "paused",
  "safety_paused",
  "completed",
  "stopped",
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

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type EmailStatus = z.infer<typeof EmailStatusSchema>;
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;
export type MessageEventType = z.infer<typeof MessageEventTypeSchema>;
export type LeadSelection = z.infer<typeof LeadSelectionSchema>;
