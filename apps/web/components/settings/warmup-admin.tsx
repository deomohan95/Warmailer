"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { IconAlert, IconCheck } from "@/components/icons";
import { Card, CardHead, Notice, StatusPill } from "@/components/ui/primitives";
import type { WarmupSeedAccount } from "@/lib/types";

export function WarmupAdmin({ seeds }: { seeds: WarmupSeedAccount[] }) {
  const router = useRouter();
  const [seedForm, setSeedForm] = useState({
    emailAddress: "",
    composioUserId: "",
    composioConnectedAccountId: "",
  });
  const [savingSeed, setSavingSeed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveSeed(event: React.FormEvent) {
    event.preventDefault();
    setSavingSeed(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/warmup/seeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(seedForm),
    });

    setSavingSeed(false);

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "Seed account save failed");
      return;
    }

    setSeedForm({ emailAddress: "", composioUserId: "", composioConnectedAccountId: "" });
    setMessage("Gmail seed account saved.");
    router.refresh();
  }

  return (
    <Card className="section">
      <CardHead
        title="Gmail seed accounts"
        display
        actions={<StatusPill label={`${seeds.length} connected`} tone={seeds.length ? "good" : "neutral"} />}
      />
      <form className="card-body stack" style={{ gap: "var(--s-4)" }} onSubmit={saveSeed}>
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

        <div className="field-row">
          <div className="field">
            <label htmlFor="warmup-seed-email">Email address</label>
            <input
              id="warmup-seed-email"
              className="input"
              type="email"
              value={seedForm.emailAddress}
              onChange={(event) => setSeedForm((current) => ({ ...current, emailAddress: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="warmup-seed-user">Composio user id</label>
            <input
              id="warmup-seed-user"
              className="input"
              value={seedForm.composioUserId}
              onChange={(event) => setSeedForm((current) => ({ ...current, composioUserId: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="warmup-seed-account">Composio connected account id</label>
            <input
              id="warmup-seed-account"
              className="input"
              value={seedForm.composioConnectedAccountId}
              onChange={(event) => setSeedForm((current) => ({ ...current, composioConnectedAccountId: event.target.value }))}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={
            savingSeed ||
            !seedForm.emailAddress.trim() ||
            !seedForm.composioUserId.trim() ||
            !seedForm.composioConnectedAccountId.trim()
          }
        >
          {savingSeed ? "Saving..." : "Add seed account"}
        </button>

        {seeds.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {seeds.map((seed) => (
                  <tr key={seed.seedAccountId}>
                    <td>{seed.emailAddress}</td>
                    <td>{seed.status}</td>
                    <td>{seed.lastCheckedAt ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
