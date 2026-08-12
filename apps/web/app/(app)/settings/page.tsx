import { IconAlert, IconLeads } from "@/components/icons";
import { Card, EmptyState, Notice, PageHeader, StatusPill } from "@/components/ui/primitives";
import { getActiveWorkspace } from "@/lib/backend-data";

export const metadata = { title: "Settings · Warmailer" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-aside">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { workspaceId, name, role } = await getActiveWorkspace();

  return (
    <main className="page">
      <PageHeader
        title="Settings"
        description={`Everything on this page applies to the active workspace only (${workspaceId}). Warmailer is multi-client — nothing here is global.`}
      />

      <Notice tone="accent" icon={<IconAlert />}>
        No setting can be saved yet. These controls are disabled until the workspace tables are wired, so nothing on
        this page is stored.
      </Notice>

      <Card className="section">
        <div className="card-body">
          <Section
            title="Workspace"
            description="The client this workspace sends on behalf of. Every lead, campaign, mailbox and reply is scoped to it."
          >
            <div className="stack" style={{ gap: "var(--s-4)" }}>
              <div className="field">
                <label htmlFor="workspace-name">Workspace name</label>
                <input id="workspace-name" className="input" defaultValue={name} disabled />
              </div>
              <div className="field">
                <label htmlFor="workspace-id">Workspace id</label>
                <input id="workspace-id" className="input" defaultValue={workspaceId} disabled />
                <span className="field-hint">Read-only. Used as the scope key on every record.</span>
              </div>
            </div>
          </Section>

          <Section
            title="Team and roles"
            description="Who can see and operate this workspace. Role decides who may launch campaigns and edit mailbox limits."
          >
            <div className="stack" style={{ gap: "var(--s-4)" }}>
              <div className="row" style={{ gap: "var(--s-2)" }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  Your role
                </span>
                <StatusPill label={role.charAt(0).toUpperCase() + role.slice(1)} tone="accent" />
              </div>
              <EmptyState
                small
                icon={<IconLeads />}
                title="No team members yet"
                description="Members appear here once workspace membership is connected. Invites are not available in this build."
                action={
                  <button type="button" className="btn btn-secondary" disabled>
                    Invite a member
                  </button>
                }
              />
            </div>
          </Section>

          <Section
            title="Suppression"
            description="Addresses and domains that must never receive a send, whatever a campaign selects."
          >
            <div className="stack" style={{ gap: "var(--s-4)" }}>
              <div className="field">
                <label htmlFor="suppression-list">Suppressed addresses and domains</label>
                <textarea
                  id="suppression-list"
                  className="textarea"
                  style={{ minHeight: 96 }}
                  placeholder={"one per line\nexample.com\nsomeone@example.com"}
                  disabled
                />
                <span className="field-hint">
                  Suppressed leads are skipped by every campaign and show a Suppressed status on the Leads page.
                </span>
              </div>
              <label className="row" style={{ gap: 8, fontSize: 13 }}>
                <input type="checkbox" defaultChecked disabled />
                Suppress a lead automatically when a reply asks to unsubscribe
              </label>
            </div>
          </Section>

          <Section
            title="Unsubscribe footer"
            description="Appended to every campaign email. Kept out of the sequence editor so it cannot be removed per campaign."
          >
            <div className="field">
              <label htmlFor="unsubscribe-footer">Footer text</label>
              <textarea
                id="unsubscribe-footer"
                className="textarea"
                style={{ minHeight: 72 }}
                placeholder="Not configured yet."
                disabled
              />
            </div>
          </Section>

          <Section
            title="Tracking domain"
            description="A domain you own, used for link and open tracking once tracking is built."
          >
            <div className="stack" style={{ gap: "var(--s-3)" }}>
              <div className="field">
                <label htmlFor="tracking-domain">Tracking domain</label>
                <input id="tracking-domain" className="input" placeholder="track.yourdomain.com" disabled />
              </div>
              <p className="subtle" style={{ fontSize: 12.5 }}>
                Open tracking is not configured yet, which is why no open rate appears anywhere in the app.
              </p>
            </div>
          </Section>

          <Section title="Billing" description="Plan and invoices for this workspace.">
            <EmptyState
              small
              title="Billing is not set up"
              description="Plan and usage will appear here. There is nothing to charge against yet."
            />
          </Section>
        </div>
      </Card>
    </main>
  );
}
