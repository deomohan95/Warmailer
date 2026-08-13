"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { IconAlert, IconCheck, IconLeads, IconMailbox } from "@/components/icons";
import { Card, CardHead, EmptyState, Meter, Notice, StatusPill } from "@/components/ui/primitives";
import {
  availableToday,
  campaignDailyCapacity,
  estimatedDaysToComplete,
  isSendable,
  launchBlockers,
  SUPPORTED_VARIABLES,
  unresolvedVariables,
} from "@/lib/capacity";
import { formatSendingDays, LEAD_STATUS, MAILBOX_STATUS } from "@/lib/labels";
import type { CampaignSchedule, Lead, Mailbox, SequenceStep } from "@/lib/types";

const STEPS = [
  "Campaign basics",
  "Select leads",
  "Select mailboxes",
  "Email sequence",
  "Schedule and limits",
  "Review and launch",
] as const;

const TIMEZONES = ["Europe/London", "Europe/Berlin", "America/New_York", "Asia/Kolkata", "UTC"];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

const emptySequence: SequenceStep[] = [
  {
    stepId: "step_1",
    subject: "Quick question about {{company}}",
    body: "Hi {{first_name}},\n\nI wanted to ask about {{company}}.\n\nBest,",
    delayDays: 0,
  },
];

const defaultSchedule: CampaignSchedule = {
  startDate: "",
  sendingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
  perMailboxDelaySeconds: 120,
  maxSendsPerDay: 0,
  timezone: TIMEZONES[0] as string,
};

export function CampaignWizard({
  leads,
  mailboxes,
  initialLeadIds = [],
}: {
  leads: Lead[];
  mailboxes: Mailbox[];
  initialLeadIds?: string[];
}) {
  const router = useRouter();
  const leadIdSet = useMemo(() => new Set(leads.map((lead) => lead.leadId)), [leads]);
  const validInitialLeadIds = useMemo(
    () => initialLeadIds.filter((leadId) => leadIdSet.has(leadId)),
    [initialLeadIds, leadIdSet],
  );
  const [step, setStep] = useState(validInitialLeadIds.length > 0 ? 1 : 0);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0] as string);
  const [leadIds, setLeadIds] = useState<string[]>(validInitialLeadIds);
  const [mailboxIds, setMailboxIds] = useState<string[]>([]);
  const [sequence, setSequence] = useState<SequenceStep[]>(emptySequence);
  const [schedule, setSchedule] = useState<CampaignSchedule>(defaultSchedule);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");

  const selectedLeads = useMemo(
    () => leads.filter((lead) => leadIds.includes(lead.leadId)),
    [leads, leadIds],
  );
  const visibleLeads = useMemo(
    () =>
      validInitialLeadIds.length > 0
        ? leads.filter((lead) => validInitialLeadIds.includes(lead.leadId))
        : leads,
    [leads, validInitialLeadIds],
  );
  const selectedMailboxes = useMemo(
    () => mailboxes.filter((mailbox) => mailboxIds.includes(mailbox.mailboxId)),
    [mailboxes, mailboxIds],
  );

  const missingEmail = selectedLeads.filter((lead) => !lead.email && lead.emailStatus !== "suppressed");
  const suppressed = selectedLeads.filter((lead) => lead.emailStatus === "suppressed");
  const alreadyRunning = selectedLeads.filter((lead) => Boolean(lead.activeCampaignId));
  const eligible = selectedLeads.filter(
    (lead) => Boolean(lead.email) && lead.emailStatus !== "suppressed" && !lead.activeCampaignId,
  );

  const capacity = campaignDailyCapacity(selectedMailboxes);
  const effectiveSchedule: CampaignSchedule = { ...schedule, timezone };
  const blockers = launchBlockers({
    eligibleLeadCount: eligible.length,
    selectedMailboxes,
    sequence,
    schedule: effectiveSchedule,
  });
  const unresolved = unresolvedVariables(sequence);
  const days = estimatedDaysToComplete(eligible.length, Math.min(capacity, schedule.maxSendsPerDay || capacity));

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  }

  function updateStep(index: number, patch: Partial<SequenceStep>) {
    setSequence((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function insertBodyVariable(index: number, variable: string, position?: number) {
    const token = `{{${variable}}}`;
    setSequence((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const body =
          position === undefined
            ? `${item.body}${item.body ? " " : ""}${token}`
            : `${item.body.slice(0, position)}${token}${item.body.slice(position)}`;
        return { ...item, body };
      }),
    );
  }

  function addFollowUp() {
    setSequence((current) => [
      ...current,
      { stepId: `step_${current.length + 1}`, subject: "", body: "", delayDays: 3 },
    ]);
  }

  async function launchCampaign() {
    setLaunching(true);
    setLaunchError("");

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          leadIds: eligible.map((lead) => lead.leadId),
          mailboxIds,
          sequence,
          schedule: effectiveSchedule,
        }),
      });
      const data = (await response.json()) as { campaignId?: string; error?: string };
      if (!response.ok || !data.campaignId) throw new Error(data.error ?? "Campaign launch failed");
      router.push(`/campaigns/${data.campaignId}`);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Campaign launch failed");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="wizard">
      <nav className="stepper" aria-label="Campaign steps">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`step ${index < step ? "step-done" : ""}`.trim()}
            aria-current={index === step ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            <span className="step-index">{index < step ? <IconCheck size={11} /> : index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      <div>
        <Card>
          <CardHead title={STEPS[step] as string} display />
          <div className="card-body">
            {step === 0 ? (
              <div className="stack" style={{ gap: "var(--s-4)" }}>
                <div className="field">
                  <label htmlFor="campaign-name">Campaign name</label>
                  <input
                    id="campaign-name"
                    className="input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Logistics Q3 — operations leads"
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="campaign-timezone">Timezone</label>
                    <select
                      id="campaign-timezone"
                      className="select"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    >
                      {TIMEZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">Sending windows and schedules are read in this timezone.</span>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              leads.length === 0 ? (
                <EmptyState
                  icon={<IconLeads />}
                  title="No leads imported yet"
                  description="Import leads before finding emails, then come back to select them for this campaign."
                  action={
                    <Link href="/leads" className="btn btn-secondary">
                      Go to Leads
                    </Link>
                  }
                />
              ) : (
                <div className="stack" style={{ gap: "var(--s-4)" }}>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col" className="col-select">
                            <span className="sr-only">Select</span>
                          </th>
                          <th scope="col">Lead</th>
                          <th scope="col">Company</th>
                          <th scope="col">Email</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLeads.map((lead) => (
                          <tr key={lead.leadId}>
                            <td className="col-select">
                              <input
                                type="checkbox"
                                checked={leadIds.includes(lead.leadId)}
                                onChange={() => setLeadIds((current) => toggle(current, lead.leadId))}
                                aria-label={`Select ${lead.name}`}
                              />
                            </td>
                            <td className="cell-strong">{lead.name}</td>
                            <td>{lead.company}</td>
                            <td>{lead.email ?? <span className="subtle">—</span>}</td>
                            <td>
                              <StatusPill {...LEAD_STATUS[lead.emailStatus]} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <dl className="review-grid">
                    <dt>Selected</dt>
                    <dd>{selectedLeads.length.toLocaleString()}</dd>
                    <dt>Eligible to send</dt>
                    <dd>{eligible.length.toLocaleString()}</dd>
                    <dt>Skipped — no email</dt>
                    <dd>{missingEmail.length.toLocaleString()}</dd>
                    <dt>Skipped — suppressed</dt>
                    <dd>{suppressed.length.toLocaleString()}</dd>
                    <dt>Skipped — already in an active campaign</dt>
                    <dd>{alreadyRunning.length.toLocaleString()}</dd>
                  </dl>
                </div>
              )
            ) : null}

            {step === 2 ? (
              mailboxes.length === 0 ? (
                <EmptyState
                  icon={<IconMailbox />}
                  title="No mailbox connected yet"
                  description="Connect a mailbox before launching. Its daily and hourly hard limits set what this campaign can send."
                  action={
                    <Link href="/mailboxes" className="btn btn-secondary">
                      Go to Mailboxes
                    </Link>
                  }
                />
              ) : (
                <div className="stack" style={{ gap: "var(--s-4)" }}>
                  {mailboxes.map((mailbox) => (
                    <label
                      key={mailbox.mailboxId}
                      className="row"
                      style={{ gap: "var(--s-3)", alignItems: "flex-start" }}
                    >
                      <input
                        type="checkbox"
                        style={{ marginTop: 4 }}
                        checked={mailboxIds.includes(mailbox.mailboxId)}
                        onChange={() => setMailboxIds((current) => toggle(current, mailbox.mailboxId))}
                        disabled={!isSendable(mailbox)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: "var(--s-2)" }}>
                          <span className="cell-strong">{mailbox.emailAddress}</span>
                          <StatusPill {...MAILBOX_STATUS[mailbox.status]} />
                        </div>
                        <Meter
                          label={`Daily limit ${mailbox.dailyHardLimit}`}
                          value={mailbox.usedToday + mailbox.reservedToday}
                          max={mailbox.dailyHardLimit}
                          valueLabel={`${availableToday(mailbox)} available today`}
                          tone={isSendable(mailbox) ? "accent" : "warning"}
                        />
                      </div>
                    </label>
                  ))}

                  <Notice tone="accent" icon={<IconAlert />}>
                    This campaign can send only through selected mailboxes and cannot exceed their hard limits. Capacity
                    available today: <strong className="num">{capacity.toLocaleString()}</strong>.
                  </Notice>
                </div>
              )
            ) : null}

            {step === 3 ? (
              <div className="stack" style={{ gap: "var(--s-5)" }}>
                {sequence.map((item, index) => (
                  <div key={item.stepId} className="stack" style={{ gap: "var(--s-3)" }}>
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      <h3 style={{ fontSize: 13.5 }}>{index === 0 ? "First email" : `Follow-up ${index}`}</h3>
                      {index > 0 ? (
                        <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <label htmlFor={`delay-${item.stepId}`}>after</label>
                          <input
                            id={`delay-${item.stepId}`}
                            className="input num"
                            style={{ width: 64 }}
                            type="number"
                            min={1}
                            value={item.delayDays}
                            onChange={(event) =>
                              updateStep(index, { delayDays: Number(event.target.value) || 0 })
                            }
                          />
                          <span className="muted">days</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="field">
                      <label htmlFor={`subject-${item.stepId}`}>Subject</label>
                      <input
                        id={`subject-${item.stepId}`}
                        className="input"
                        value={item.subject}
                        onChange={(event) => updateStep(index, { subject: event.target.value })}
                        placeholder="Quick question about {{company}}"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`body-${item.stepId}`}>Body</label>
                      <textarea
                        id={`body-${item.stepId}`}
                        className="textarea"
                        value={item.body}
                        onChange={(event) => updateStep(index, { body: event.target.value })}
                        onDrop={(event) => {
                          const token = event.dataTransfer.getData("text/plain");
                          const variable = token.match(/^\{\{(.+)\}\}$/)?.[1] as SupportedVariable | undefined;
                          if (!variable || !SUPPORTED_VARIABLES.includes(variable)) return;
                          event.preventDefault();
                          insertBodyVariable(index, variable, event.currentTarget.selectionStart);
                        }}
                        placeholder={"Hi {{first_name}},\n\n…"}
                      />
                      <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                        <span className="field-hint">Insert variable — click or drag</span>
                        {SUPPORTED_VARIABLES.map((variable) => (
                          <button
                            key={variable}
                            type="button"
                            className="tag"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("text/plain", `{{${variable}}}`);
                            }}
                            onClick={() => insertBodyVariable(index, variable)}
                          >
                            {`{{${variable}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {unresolved.length > 0 ? (
                  <Notice tone="critical" icon={<IconAlert />}>
                    Unknown variables will not be replaced: {unresolved.map((v) => `{{${v}}}`).join(", ")}.
                  </Notice>
                ) : null}

                <div>
                  <button type="button" className="btn btn-secondary" onClick={addFollowUp}>
                    Add follow-up
                  </button>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="stack" style={{ gap: "var(--s-4)" }}>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="start-date">Start date</label>
                    <input
                      id="start-date"
                      className="input"
                      type="date"
                      value={schedule.startDate}
                      onChange={(event) => setSchedule({ ...schedule, startDate: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="window-start">Sending window opens</label>
                    <input
                      id="window-start"
                      className="input"
                      type="time"
                      value={schedule.windowStart}
                      onChange={(event) => setSchedule({ ...schedule, windowStart: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="window-end">Sending window closes</label>
                    <input
                      id="window-end"
                      className="input"
                      type="time"
                      value={schedule.windowEnd}
                      onChange={(event) => setSchedule({ ...schedule, windowEnd: event.target.value })}
                    />
                  </div>
                </div>

                <fieldset className="field" style={{ border: 0, padding: 0 }}>
                  <legend className="field-hint" style={{ marginBottom: 6 }}>
                    Sending days
                  </legend>
                  <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                    {DAY_LABELS.map((label, day) => (
                      <label key={label} className="row" style={{ gap: 5, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={schedule.sendingDays.includes(day)}
                          onChange={() =>
                            setSchedule({
                              ...schedule,
                              sendingDays: schedule.sendingDays.includes(day)
                                ? schedule.sendingDays.filter((value) => value !== day)
                                : [...schedule.sendingDays, day],
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="mailbox-delay">Delay between sends per mailbox</label>
                    <input
                      id="mailbox-delay"
                      className="input num"
                      type="number"
                      min={0}
                      value={schedule.perMailboxDelaySeconds}
                      onChange={(event) =>
                        setSchedule({ ...schedule, perMailboxDelaySeconds: Number(event.target.value) || 0 })
                      }
                    />
                    <span className="field-hint">Seconds.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="max-per-day">Max sends per day for this campaign</label>
                    <input
                      id="max-per-day"
                      className="input num"
                      type="number"
                      min={0}
                      max={capacity || undefined}
                      value={schedule.maxSendsPerDay}
                      onChange={(event) =>
                        setSchedule({ ...schedule, maxSendsPerDay: Number(event.target.value) || 0 })
                      }
                    />
                    <span className="field-hint">
                      Cannot exceed the {capacity.toLocaleString()} sends the selected mailboxes allow today.
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="stack" style={{ gap: "var(--s-4)" }}>
                <dl className="review-grid">
                  <dt>Campaign</dt>
                  <dd>{name || <span className="subtle">Unnamed</span>}</dd>
                  <dt>Eligible leads</dt>
                  <dd>{eligible.length.toLocaleString()}</dd>
                  <dt>Selected mailboxes</dt>
                  <dd>{selectedMailboxes.length}</dd>
                  <dt>Capacity available today</dt>
                  <dd>{capacity.toLocaleString()}</dd>
                  <dt>Estimated days to complete</dt>
                  <dd>{days === null ? <span className="subtle">Not calculable yet</span> : days}</dd>
                  <dt>Sequence</dt>
                  <dd>
                    {sequence.length} email{sequence.length === 1 ? "" : "s"}
                  </dd>
                  <dt>Schedule</dt>
                  <dd>
                    {formatSendingDays(schedule.sendingDays)}, {schedule.windowStart}–{schedule.windowEnd} {timezone}
                  </dd>
                </dl>

                <Notice tone="accent" icon={<IconAlert />}>
                  This campaign can send only through selected mailboxes and cannot exceed their hard limits.
                </Notice>

                {blockers.length > 0 ? (
                  <div className="blockers">
                    {blockers.map((blocker) => (
                      <Notice key={blocker.code} tone="critical" icon={<IconAlert />}>
                        {blocker.message}
                      </Notice>
                    ))}
                  </div>
                ) : (
                  <Notice tone="neutral" icon={<IconCheck />}>
                    All launch checks pass.
                  </Notice>
                )}
                {launchError ? (
                  <Notice tone="critical" icon={<IconAlert />}>
                    {launchError}
                  </Notice>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>

        <div className="wizard-foot">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={blockers.length > 0 || launching}
              onClick={launchCampaign}
            >
              {launching ? "Launching..." : "Launch campaign"}
            </button>
          )}
          <div className="spacer" />
          {blockers.length > 0 ? (
            <span className="subtle" style={{ fontSize: 12.5 }}>
              {blockers.length} check{blockers.length === 1 ? "" : "s"} blocking launch
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
