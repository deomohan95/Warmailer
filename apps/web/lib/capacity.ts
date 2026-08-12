import type { CampaignSchedule, MailboxCapacity, SequenceStep } from "@/lib/types";

/**
 * The only capacity maths in the frontend. Mailbox hard limits are the source of
 * truth for what a campaign may send; no page is allowed to compute its own.
 */

/** Variables the sequence editor can resolve from a lead record. */
export const SUPPORTED_VARIABLES = ["first_name", "company", "job_title"] as const;

export type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

/** A mailbox may only carry campaign sends when it is fully connected. */
export function isSendable(mailbox: MailboxCapacity): boolean {
  return mailbox.status === "connected";
}

/** Never negative — a mailbox that is over its limit contributes nothing. */
export function availableToday(mailbox: MailboxCapacity): number {
  return Math.max(0, mailbox.dailyHardLimit - mailbox.usedToday - mailbox.reservedToday);
}

/** Sum of today's headroom across the sendable mailboxes selected for a campaign. */
export function campaignDailyCapacity(mailboxes: readonly MailboxCapacity[]): number {
  return mailboxes.filter(isSendable).reduce((total, mailbox) => total + availableToday(mailbox), 0);
}

/** Whole days needed to work through the selection at the effective daily rate. */
export function estimatedDaysToComplete(leadCount: number, dailyCapacity: number): number | null {
  if (leadCount <= 0 || dailyCapacity <= 0) return null;
  return Math.ceil(leadCount / dailyCapacity);
}

/** Every `{{token}}` in the sequence that is not a supported variable. */
export function unresolvedVariables(steps: readonly SequenceStep[]): string[] {
  const supported = new Set<string>(SUPPORTED_VARIABLES);
  const found = new Set<string>();

  for (const step of steps) {
    for (const match of `${step.subject}\n${step.body}`.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      const token = match[1];
      if (token && !supported.has(token)) found.add(token);
    }
  }

  return [...found].sort();
}

export function isScheduleValid(schedule: CampaignSchedule): boolean {
  return (
    schedule.startDate.length > 0 &&
    schedule.sendingDays.length > 0 &&
    schedule.windowStart < schedule.windowEnd &&
    schedule.perMailboxDelaySeconds >= 0 &&
    schedule.maxSendsPerDay >= 1
  );
}

export type LaunchBlockerCode =
  | "no_leads_selected"
  | "no_mailbox_selected"
  | "mailbox_not_connected"
  | "mailbox_paused_or_error"
  | "capacity_exceeded"
  | "daily_cap_exceeds_capacity"
  | "empty_sequence"
  | "invalid_schedule"
  | "unresolved_variables";

export type LaunchBlocker = {
  code: LaunchBlockerCode;
  message: string;
};

export type LaunchCheckInput = {
  eligibleLeadCount: number;
  selectedMailboxes: readonly MailboxCapacity[];
  sequence: readonly SequenceStep[];
  schedule: CampaignSchedule;
};

/**
 * Every reason a campaign may not launch. An empty array means launch is allowed.
 * The UI must disable the launch control whenever this returns anything.
 */
export function launchBlockers(input: LaunchCheckInput): LaunchBlocker[] {
  const { eligibleLeadCount, selectedMailboxes, sequence, schedule } = input;
  const blockers: LaunchBlocker[] = [];

  if (eligibleLeadCount <= 0) {
    blockers.push({
      code: "no_leads_selected",
      message: "No eligible leads selected. Leads without an email address cannot be sent to.",
    });
  }

  if (selectedMailboxes.length === 0) {
    blockers.push({
      code: "no_mailbox_selected",
      message: "Select at least one connected mailbox.",
    });
  }

  const disconnected = selectedMailboxes.filter((mailbox) => mailbox.status === "not_connected");
  if (disconnected.length > 0) {
    blockers.push({
      code: "mailbox_not_connected",
      message: `Not connected: ${disconnected.map((mailbox) => mailbox.emailAddress).join(", ")}.`,
    });
  }

  const halted = selectedMailboxes.filter(
    (mailbox) => mailbox.status === "sending_paused" || mailbox.status === "error",
  );
  if (halted.length > 0) {
    blockers.push({
      code: "mailbox_paused_or_error",
      message: `Paused or in error: ${halted.map((mailbox) => mailbox.emailAddress).join(", ")}.`,
    });
  }

  const capacity = campaignDailyCapacity(selectedMailboxes);

  if (eligibleLeadCount > capacity) {
    blockers.push({
      code: "capacity_exceeded",
      message: `${eligibleLeadCount} leads selected but only ${capacity} sends available today across the selected mailboxes.`,
    });
  }

  if (schedule.maxSendsPerDay > capacity) {
    blockers.push({
      code: "daily_cap_exceeds_capacity",
      message: `Campaign daily cap of ${schedule.maxSendsPerDay} exceeds the ${capacity} sends the selected mailboxes allow.`,
    });
  }

  if (sequence.length === 0 || sequence.every((step) => step.body.trim().length === 0)) {
    blockers.push({ code: "empty_sequence", message: "Write at least one email before launching." });
  }

  if (!isScheduleValid(schedule)) {
    blockers.push({
      code: "invalid_schedule",
      message: "Set a start date, at least one sending day, and a valid sending window.",
    });
  }

  const unresolved = unresolvedVariables(sequence);
  if (unresolved.length > 0) {
    blockers.push({
      code: "unresolved_variables",
      message: `Unknown variables: ${unresolved.map((name) => `{{${name}}}`).join(", ")}.`,
    });
  }

  return blockers;
}

export function canLaunch(input: LaunchCheckInput): boolean {
  return launchBlockers(input).length === 0;
}
