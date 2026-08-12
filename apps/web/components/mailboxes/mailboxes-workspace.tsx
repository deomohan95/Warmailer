"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { IconAlert, IconCheck, IconClock, IconLock, IconMailbox } from "@/components/icons";
import { Card, CardHead, EmptyState, Meter, Notice, StatusPill } from "@/components/ui/primitives";
import { availableToday, campaignDailyCapacity, isSendable } from "@/lib/capacity";
import { MAILBOX_STATUS } from "@/lib/labels";
import type { Mailbox } from "@/lib/types";

const TIMEZONES = ["Europe/London", "Europe/Berlin", "America/New_York", "Asia/Kolkata", "UTC"];

export function MailboxesWorkspace({ mailboxes }: { mailboxes: Mailbox[] }) {
  const capacity = campaignDailyCapacity(mailboxes);

  return (
    <>
      <Notice tone="accent" icon={<IconAlert />}>
        These hard limits are the only source of send capacity. Campaigns read them; no campaign can raise them.
        Capacity available today across all connected mailboxes:{" "}
        <strong className="num">{capacity.toLocaleString()}</strong>.
      </Notice>

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

        <Card>
          <CardHead title="Warmup" display actions={<StatusPill label="Coming later" tone="neutral" />} />
          <div className="card-body stack" style={{ gap: "var(--s-3)" }}>
            <p className="muted" style={{ fontSize: 13 }}>
              Warmup will gradually raise a new mailbox&apos;s sending volume before campaigns use it in full.
            </p>
            <p className="subtle" style={{ fontSize: 12.5 }}>
              The warmup engine is not built. No warmup score is shown because none is being measured.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

function MailboxCard({ mailbox }: { mailbox: Mailbox }) {
  const router = useRouter();
  const available = availableToday(mailbox);
  const [editing, setEditing] = useState(false);
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
