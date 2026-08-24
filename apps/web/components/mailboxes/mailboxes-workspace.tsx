"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { IconAlert, IconCheck, IconClock, IconLock, IconMailbox } from "@/components/icons";
import { Card, CardHead, EmptyState, Meter, Notice, StatusPill } from "@/components/ui/primitives";
import { availableToday, campaignDailyCapacity, isSendable } from "@/lib/capacity";
import { MAILBOX_STATUS } from "@/lib/labels";
import type { Mailbox, WarmupMailboxStats } from "@/lib/types";

const TIMEZONES = ["Europe/London", "Europe/Berlin", "America/New_York", "Asia/Kolkata", "UTC"];

type MailboxTab = "mailboxes" | "warmup";

type WarmupFormState = {
  warmupEnabled: boolean;
  warmupDailyLimit: number;
  warmupDailyRampup: number;
  warmupRandomizeDailyCount: boolean;
  warmupRandomMinPercent: number;
  warmupReplyRatePercent: number;
  warmupInboundOriginalPercent: number;
  warmupInboundReplyRatePercent: number;
};

export function MailboxesWorkspace({
  mailboxes,
  warmupStats,
}: {
  mailboxes: Mailbox[];
  warmupStats: WarmupMailboxStats[];
}) {
  const [activeTab, setActiveTab] = useState<MailboxTab>("mailboxes");
  const capacity = campaignDailyCapacity(mailboxes);

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Mailbox sections">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === "mailboxes"}
          onClick={() => setActiveTab("mailboxes")}
        >
          Mailboxes
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === "warmup"}
          onClick={() => setActiveTab("warmup")}
        >
          Warmup
        </button>
      </div>

      {activeTab === "mailboxes" ? (
        <>
          <div className="section">
            <Notice tone="accent" icon={<IconAlert />}>
              These hard limits are the only source of send capacity. Campaigns read them; no campaign can raise them.
              Capacity available today across all connected mailboxes:{" "}
              <strong className="num">{capacity.toLocaleString()}</strong>.
            </Notice>
          </div>

          <div className="grid-2 section">
            {mailboxes.length === 0 ? (
              <Card className="span-2">
                <div className="card-body card-body-flush">
                  <EmptyState
                    icon={<IconMailbox />}
                    title="No mailbox connected yet"
                    description="Add a Zoho mailbox with its daily and hourly hard limits. Campaigns can only send through mailboxes added here."
                  />
                </div>
              </Card>
            ) : (
              mailboxes.map((mailbox) => <MailboxCard key={mailbox.mailboxId} mailbox={mailbox} />)
            )}
          </div>

          <div className="grid-2 section">
            <AddMailboxForm />
          </div>
        </>
      ) : (
        <WarmupPanel mailboxes={mailboxes} warmupStats={warmupStats} />
      )}
    </>
  );
}

function defaultWarmupState(stat?: WarmupMailboxStats): WarmupFormState {
  return {
    warmupEnabled: stat?.warmupEnabled ?? false,
    warmupDailyLimit: stat?.warmupDailyLimit ?? 25,
    warmupDailyRampup: stat?.warmupDailyRampup ?? 5,
    warmupRandomizeDailyCount: stat?.warmupRandomizeDailyCount ?? true,
    warmupRandomMinPercent: stat?.warmupRandomMinPercent ?? 10,
    warmupReplyRatePercent: stat?.warmupReplyRatePercent ?? 20,
    warmupInboundOriginalPercent: stat?.warmupInboundOriginalPercent ?? 20,
    warmupInboundReplyRatePercent: stat?.warmupInboundReplyRatePercent ?? 52,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function warmupIssue(mailbox: Mailbox) {
  if (mailbox.status !== "connected" && mailbox.status !== "warming") return "Mailbox not connected";
  if (!mailbox.appPasswordConfigured) return "Missing app password";
  return "Ready";
}

function WarmupPanel({
  mailboxes,
  warmupStats,
}: {
  mailboxes: Mailbox[];
  warmupStats: WarmupMailboxStats[];
}) {
  const router = useRouter();
  const statsByMailbox = new Map(warmupStats.map((stat) => [stat.mailboxId, stat]));
  const totals = warmupStats.reduce(
    (acc, stat) => ({
      sent7d: acc.sent7d + stat.sent7d,
      received7d: acc.received7d + stat.received7d,
      inbox7d: acc.inbox7d + stat.inbox7d,
      savedFromSpam7d: acc.savedFromSpam7d + stat.savedFromSpam7d,
      replied7d: acc.replied7d + stat.replied7d,
    }),
    { sent7d: 0, received7d: 0, inbox7d: 0, savedFromSpam7d: 0, replied7d: 0 },
  );
  const [forms, setForms] = useState<Record<string, WarmupFormState>>(() =>
    Object.fromEntries(mailboxes.map((mailbox) => [mailbox.mailboxId, defaultWarmupState(statsByMailbox.get(mailbox.mailboxId))])),
  );
  const [savingMailboxId, setSavingMailboxId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateMailbox(mailboxId: string, patch: Partial<WarmupFormState>) {
    setForms((current) => ({
      ...current,
      [mailboxId]: { ...defaultWarmupState(statsByMailbox.get(mailboxId)), ...current[mailboxId], ...patch },
    }));
  }

  async function saveWarmupSettings(mailboxId: string) {
    const state = forms[mailboxId] ?? defaultWarmupState(statsByMailbox.get(mailboxId));
    setSavingMailboxId(mailboxId);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/warmup/mailboxes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mailboxId, ...state }),
    });

    setSavingMailboxId(null);

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "Warmup update failed");
      return;
    }

    setMessage("Warmup settings saved.");
    router.refresh();
  }

  return (
    <div className="stack section" style={{ gap: "var(--s-4)" }}>
      <dl className="stat-strip">
        <div className="stat-strip-head">
          <h2>Warmup reputation</h2>
          <p>Last 7 days across sender mailboxes.</p>
        </div>
        <div className="stat-row">
          <div className="stat">
            <dt>Warmup emails sent</dt>
            <dd className="num">{totals.sent7d.toLocaleString()}</dd>
          </div>
          <div className="stat">
            <dt>Landed in inbox</dt>
            <dd className="num">{totals.inbox7d.toLocaleString()}</dd>
          </div>
          <div className="stat">
            <dt>Saved from spam</dt>
            <dd className="num">{totals.savedFromSpam7d.toLocaleString()}</dd>
          </div>
          <div className="stat">
            <dt>Fresh emails received</dt>
            <dd className="num">{totals.received7d.toLocaleString()}</dd>
          </div>
        </div>
      </dl>

      {error ? (
        <Notice tone="warning" icon={<IconAlert />}>
          {error}
        </Notice>
      ) : null}
      {message ? (
        <Notice tone="accent" icon={<IconCheck />}>
          {message}
        </Notice>
      ) : null}

      <div className="warmup-intro">
        <h2>Mailbox warmup</h2>
        <p>
          Warmup sends low-volume real emails in both directions, checks where they land, moves spam to inbox,
          marks messages important, and replies at the rates set below.
        </p>
      </div>

      {mailboxes.length === 0 ? (
        <Card>
          <div className="card-body card-body-flush">
            <EmptyState small icon={<IconMailbox />} title="No mailbox connected yet" />
          </div>
        </Card>
      ) : (
        <div className="warmup-card-list">
          {mailboxes.map((mailbox) => {
            const stat = statsByMailbox.get(mailbox.mailboxId);
            const state = forms[mailbox.mailboxId] ?? defaultWarmupState(stat);
            const targetToday = stat?.warmupTargetToday ?? Math.min(state.warmupDailyLimit, state.warmupDailyRampup);
            const rawTargetToday = stat?.warmupRawTargetToday ?? Math.min(state.warmupDailyLimit, state.warmupDailyRampup);
            const randomFloorToday = clamp(Math.round((rawTargetToday * state.warmupRandomMinPercent) / 100), 1, rawTargetToday);
            return (
              <Card key={mailbox.mailboxId} className="warmup-card">
                <div className="warmup-card-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="mailbox-address">{mailbox.emailAddress}</div>
                    <div className="cell-sub">{state.warmupEnabled ? "Warmup enabled" : "Warmup disabled"}</div>
                  </div>
                  <div className="spacer" />
                  <StatusPill {...MAILBOX_STATUS[mailbox.status]} />
                </div>

                <dl className="warmup-card-metrics">
                  <div>
                    <dt>Today</dt>
                    <dd className="num">
                      {(stat?.sentToday ?? 0).toLocaleString()} / {targetToday.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Reputation</dt>
                    <dd className="num">{stat?.reputation == null ? "-" : `${stat.reputation}%`}</dd>
                  </div>
                  <div>
                    <dt>Issue</dt>
                    <dd>{warmupIssue(mailbox)}</dd>
                  </div>
                </dl>

                <label className="check-row warmup-enable">
                  <input
                    type="checkbox"
                    checked={state.warmupEnabled}
                    onChange={(event) => updateMailbox(mailbox.mailboxId, { warmupEnabled: event.target.checked })}
                  />
                  Email warmup enabled
                </label>

                <div className="warmup-settings-grid">
                  <div className="field">
                    <label htmlFor={`${mailbox.mailboxId}-warmup-limit`}>Daily limit</label>
                    <input
                      id={`${mailbox.mailboxId}-warmup-limit`}
                      className="input num"
                      type="number"
                      min={1}
                      max={100}
                      value={state.warmupDailyLimit}
                      onChange={(event) => {
                        const nextLimit = clamp(Number(event.target.value) || 1, 1, 100);
                        updateMailbox(mailbox.mailboxId, { warmupDailyLimit: nextLimit });
                      }}
                    />
                    <span className="field-hint">Maximum warmup emails this mailbox can send per day.</span>
                  </div>

                  <div className="field">
                    <label htmlFor={`${mailbox.mailboxId}-warmup-ramp`}>Daily rampup</label>
                    <input
                      id={`${mailbox.mailboxId}-warmup-ramp`}
                      className="input num"
                      type="number"
                      min={1}
                      max={100}
                      value={state.warmupDailyRampup}
                      onChange={(event) =>
                        updateMailbox(mailbox.mailboxId, {
                          warmupDailyRampup: clamp(Number(event.target.value) || 1, 1, 100),
                        })
                      }
                    />
                    <span className="field-hint">How much the target grows each day until it reaches the limit.</span>
                  </div>

                  <div className="field warmup-range-field">
                    <label className="check-row" htmlFor={`${mailbox.mailboxId}-warmup-random-min`}>
                      <input
                        type="checkbox"
                        checked={state.warmupRandomizeDailyCount}
                        onChange={(event) =>
                          updateMailbox(mailbox.mailboxId, {
                            warmupRandomizeDailyCount: event.target.checked,
                          })
                        }
                      />
                      Randomize daily volume
                    </label>
                    <input
                      id={`${mailbox.mailboxId}-warmup-random-min`}
                      type="range"
                      min={1}
                      max={100}
                      value={state.warmupRandomMinPercent}
                      disabled={!state.warmupRandomizeDailyCount}
                      onChange={(event) =>
                        updateMailbox(mailbox.mailboxId, {
                          warmupRandomMinPercent: clamp(Number(event.target.value) || 1, 1, 100),
                        })
                      }
                    />
                    <div className="warmup-range-label">
                      <span>{state.warmupRandomMinPercent}%</span>
                      <span>100%</span>
                    </div>
                    <span className="field-hint">
                      Approx range today: {randomFloorToday}-{rawTargetToday}/day. It scales when the daily limit changes.
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor={`${mailbox.mailboxId}-warmup-reply`}>Reply rate (%)</label>
                    <input
                      id={`${mailbox.mailboxId}-warmup-reply`}
                      className="input num"
                      type="number"
                      min={0}
                      max={100}
                      value={state.warmupReplyRatePercent}
                      onChange={(event) =>
                        updateMailbox(mailbox.mailboxId, {
                          warmupReplyRatePercent: clamp(Number(event.target.value) || 0, 0, 100),
                        })
                      }
                    />
                    <span className="field-hint">Gmail seed replies to Zoho-sent warmup emails at this rate.</span>
                  </div>

                  <div className="field">
                    <label htmlFor={`${mailbox.mailboxId}-warmup-inbound`}>Fresh inbound (%)</label>
                    <input
                      id={`${mailbox.mailboxId}-warmup-inbound`}
                      className="input num"
                      type="number"
                      min={0}
                      max={100}
                      value={state.warmupInboundOriginalPercent}
                      onChange={(event) =>
                        updateMailbox(mailbox.mailboxId, {
                          warmupInboundOriginalPercent: clamp(Number(event.target.value) || 0, 0, 100),
                        })
                      }
                    />
                    <span className="field-hint">Share of fresh originals sent from Gmail seeds into this mailbox.</span>
                  </div>

                  <div className="field">
                    <label htmlFor={`${mailbox.mailboxId}-warmup-inbound-reply`}>Inbound reply (%)</label>
                    <input
                      id={`${mailbox.mailboxId}-warmup-inbound-reply`}
                      className="input num"
                      type="number"
                      min={0}
                      max={100}
                      value={state.warmupInboundReplyRatePercent}
                      onChange={(event) =>
                        updateMailbox(mailbox.mailboxId, {
                          warmupInboundReplyRatePercent: clamp(Number(event.target.value) || 0, 0, 100),
                        })
                      }
                    />
                    <span className="field-hint">This Zoho mailbox replies to fresh Gmail-seed emails at this rate.</span>
                  </div>
                </div>

                <div className="warmup-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={savingMailboxId === mailbox.mailboxId}
                    onClick={() => saveWarmupSettings(mailbox.mailboxId)}
                  >
                    {savingMailboxId === mailbox.mailboxId ? "Saving..." : "Save warmup settings"}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MailboxCard({ mailbox }: { mailbox: Mailbox }) {
  const router = useRouter();
  const available = availableToday(mailbox);
  const [editing, setEditing] = useState(false);
  const [senderName, setSenderName] = useState(mailbox.displayName);
  const [dailyHardLimit, setDailyHardLimit] = useState(mailbox.dailyHardLimit);
  const [hourlyHardLimit, setHourlyHardLimit] = useState(mailbox.hourlyHardLimit);
  const [windowStart, setWindowStart] = useState(mailbox.sendingWindowStart);
  const [windowEnd, setWindowEnd] = useState(mailbox.sendingWindowEnd);
  const [timezone, setTimezone] = useState(mailbox.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowValid = windowStart < windowEnd;

  async function saveLimits(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/mailboxes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mailboxId: mailbox.mailboxId,
        displayName: senderName,
        dailyHardLimit,
        hourlyHardLimit,
        sendingWindowStart: windowStart,
        sendingWindowEnd: windowEnd,
        timezone,
      }),
    });

    setSaving(false);

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "Mailbox update failed");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  return (
    <Card className="mailbox-card">
      <div className="mailbox-head">
        <div style={{ minWidth: 0 }}>
          <div className="mailbox-address">{mailbox.emailAddress}</div>
          <div className="cell-sub">{mailbox.displayName}</div>
        </div>
        <div className="spacer" />
        <StatusPill {...MAILBOX_STATUS[mailbox.status]} />
      </div>

      <Meter
        label={`Used and reserved of ${mailbox.dailyHardLimit} daily`}
        value={mailbox.usedToday + mailbox.reservedToday}
        max={mailbox.dailyHardLimit}
        valueLabel={`${available} available today`}
        tone={isSendable(mailbox) ? "accent" : "warning"}
      />

      <dl className="limit-grid">
        <div>
          <dt>Daily hard limit</dt>
          <dd className="num">{mailbox.dailyHardLimit}</dd>
        </div>
        <div>
          <dt>Hourly hard limit</dt>
          <dd className="num">{mailbox.hourlyHardLimit}</dd>
        </div>
        <div>
          <dt>Used today</dt>
          <dd className="num">{mailbox.usedToday}</dd>
        </div>
        <div>
          <dt>Reserved today</dt>
          <dd className="num">{mailbox.reservedToday}</dd>
        </div>
        <div>
          <dt>Available today</dt>
          <dd className="num">{available}</dd>
        </div>
        <div>
          <dt>Sending window</dt>
          <dd>
            {mailbox.sendingWindowStart}–{mailbox.sendingWindowEnd}
          </dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{mailbox.timezone}</dd>
        </div>
        <div>
          <dt>App password</dt>
          {/* The secret is write-only: the record carries a flag, never a value. */}
          <dd className="row" style={{ gap: 5 }}>
            {mailbox.appPasswordConfigured ? (
              <>
                <IconCheck size={13} />
                App password configured
              </>
            ) : (
              <span className="subtle">Not set</span>
            )}
          </dd>
        </div>
      </dl>

      {editing ? (
        <form className="stack" style={{ gap: "var(--s-3)" }} onSubmit={saveLimits}>
          <div className="field">
            <label htmlFor={`${mailbox.mailboxId}-sender-name`}>Sender display name</label>
            <input
              id={`${mailbox.mailboxId}-sender-name`}
              className="input"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${mailbox.mailboxId}-daily`}>Daily hard limit</label>
              <input
                id={`${mailbox.mailboxId}-daily`}
                className="input num"
                type="number"
                min={1}
                max={500}
                value={dailyHardLimit}
                onChange={(event) => setDailyHardLimit(Number(event.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${mailbox.mailboxId}-hourly`}>Hourly hard limit</label>
              <input
                id={`${mailbox.mailboxId}-hourly`}
                className="input num"
                type="number"
                min={1}
                max={100}
                value={hourlyHardLimit}
                onChange={(event) => setHourlyHardLimit(Number(event.target.value) || 0)}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${mailbox.mailboxId}-start`}>Window opens</label>
              <input
                id={`${mailbox.mailboxId}-start`}
                className="input"
                type="time"
                value={windowStart}
                onChange={(event) => setWindowStart(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${mailbox.mailboxId}-end`}>Window closes</label>
              <input
                id={`${mailbox.mailboxId}-end`}
                className="input"
                type="time"
                value={windowEnd}
                onChange={(event) => setWindowEnd(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${mailbox.mailboxId}-timezone`}>Timezone</label>
              <select
                id={`${mailbox.mailboxId}-timezone`}
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
            </div>
          </div>

          {!windowValid ? (
            <Notice tone="warning" icon={<IconClock size={14} />}>
              The sending window must close after it opens.
            </Notice>
          ) : null}

          {error ? (
            <Notice tone="warning" icon={<IconAlert />}>
              {error}
            </Notice>
          ) : null}

          <div className="row" style={{ gap: "var(--s-2)" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!windowValid || dailyHardLimit < 1 || hourlyHardLimit < 1 || saving}
            >
              {saving ? "Saving..." : "Save limits"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            Edit limits
          </button>
          <button type="button" className="btn btn-ghost" disabled>
            {mailbox.status === "sending_paused" ? "Resume sending" : "Pause sending"}
          </button>
        </div>
      )}
    </Card>
  );
}

function AddMailboxForm() {
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [dailyHardLimit, setDailyHardLimit] = useState(100);
  const [hourlyHardLimit, setHourlyHardLimit] = useState(15);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [timezone, setTimezone] = useState(TIMEZONES[0] as string);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const windowValid = windowStart < windowEnd;
  const complete =
    emailAddress.trim().length > 0 && appPassword.length > 0 && dailyHardLimit >= 1 && hourlyHardLimit >= 1;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        emailAddress,
        displayName,
        appPassword,
        dailyHardLimit,
        hourlyHardLimit,
        sendingWindowStart: windowStart,
        sendingWindowEnd: windowEnd,
        timezone,
      }),
    });

    setAppPassword("");
    setSaving(false);

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "Mailbox save failed");
      return;
    }

    setEmailAddress("");
    setDisplayName("");
    setMessage("Mailbox saved. Campaign capacity will now use its hard limits.");
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="Add a mailbox" display />
      <form className="card-body stack" style={{ gap: "var(--s-4)" }} onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="mailbox-email">Email address</label>
          <input
            id="mailbox-email"
            className="input"
            type="email"
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            placeholder="outreach@yourdomain.com"
          />
        </div>

        <div className="field">
          <label htmlFor="mailbox-name">Display name</label>
          <input
            id="mailbox-name"
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Dave at Warmailer"
          />
        </div>

        <div className="field">
          <label htmlFor="mailbox-password">Zoho app password</label>
          <input
            id="mailbox-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
          />
          <span className="field-hint row" style={{ gap: 5 }}>
            <IconLock size={12} />
            Stored write-only. Once saved it is never sent back to the browser.
          </span>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="mailbox-daily">Daily hard limit</label>
            <input
              id="mailbox-daily"
              className="input num"
              type="number"
              min={1}
              value={dailyHardLimit}
              onChange={(event) => setDailyHardLimit(Number(event.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label htmlFor="mailbox-hourly">Hourly hard limit</label>
            <input
              id="mailbox-hourly"
              className="input num"
              type="number"
              min={1}
              value={hourlyHardLimit}
              onChange={(event) => setHourlyHardLimit(Number(event.target.value) || 0)}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="mailbox-window-start">Sending window opens</label>
            <input
              id="mailbox-window-start"
              className="input"
              type="time"
              value={windowStart}
              onChange={(event) => setWindowStart(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mailbox-window-end">Sending window closes</label>
            <input
              id="mailbox-window-end"
              className="input"
              type="time"
              value={windowEnd}
              onChange={(event) => setWindowEnd(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mailbox-timezone">Timezone</label>
            <select
              id="mailbox-timezone"
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
          </div>
        </div>

        {!windowValid ? (
          <Notice tone="warning" icon={<IconClock size={14} />}>
            The sending window must close after it opens.
          </Notice>
        ) : null}

        {error ? (
          <Notice tone="warning" icon={<IconAlert />}>
            {error}
          </Notice>
        ) : null}

        {message ? (
          <Notice tone="accent" icon={<IconCheck />}>
            {message}
          </Notice>
        ) : null}

        <div>
          <button type="submit" className="btn btn-primary" disabled={!complete || !windowValid || saving}>
            {saving ? "Connecting..." : "Connect mailbox"}
          </button>
        </div>
      </form>
    </Card>
  );
}
