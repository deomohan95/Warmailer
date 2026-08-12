import { describe, expect, it } from "vitest";

import {
  CampaignStatusSchema,
  EmailStatusSchema,
  JobStatusSchema,
  LeadSelectionSchema,
  MessageDirectionSchema,
  MessageEventTypeSchema,
  WorkspaceRoleSchema,
} from "../src/index";

describe("Warmailer shared contracts", () => {
  it("exports the frozen status enums used across workers and the app", () => {
    expect(JobStatusSchema.options).toEqual([
      "queued",
      "running",
      "completed",
      "completed_with_errors",
      "failed",
      "cancelled",
    ]);
    expect(WorkspaceRoleSchema.options).toEqual(["owner", "admin", "member"]);
    expect(EmailStatusSchema.options).toEqual(["not_enriched", "queued", "processing", "found", "not_found", "failed"]);
    expect(CampaignStatusSchema.options).toEqual([
      "draft",
      "scheduled",
      "active",
      "paused",
      "safety_paused",
      "completed",
      "stopped",
    ]);
    expect(MessageDirectionSchema.options).toEqual(["inbound", "outbound"]);
    expect(MessageEventTypeSchema.options).toEqual([
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
  });

  it("accepts explicit lead IDs or a saved filter token, but not browser workspace IDs", () => {
    expect(LeadSelectionSchema.parse({ leadIds: ["lead_1", "lead_2"] })).toEqual({
      leadIds: ["lead_1", "lead_2"],
    });
    expect(LeadSelectionSchema.parse({ filterToken: "flt_123", excludedLeadIds: ["lead_3"] })).toEqual({
      filterToken: "flt_123",
      excludedLeadIds: ["lead_3"],
    });

    expect(() => LeadSelectionSchema.parse({ workspaceId: "workspace_from_browser", leadIds: ["lead_1"] })).toThrow();
    expect(() => LeadSelectionSchema.parse({ filterToken: "flt_123" })).toThrow();
  });
});
