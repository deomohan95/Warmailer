"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { IconLeads, IconSearch, IconUpload } from "@/components/icons";
import { EmptyState, Notice, StatusPill } from "@/components/ui/primitives";
import { LEAD_STATUS } from "@/lib/labels";
import type { Lead, LeadImport, LeadStatus } from "@/lib/types";

const STATUS_ORDER: LeadStatus[] = [
  "not_enriched",
  "queued",
  "processing",
  "email_found",
  "not_found",
  "failed",
  "suppressed",
];

/**
 * The overview figures. Tones match the status pills the table already uses, so a
 * count and its rows never disagree; the dot is the state signal, the text stays
 * in ink tokens.
 */
type UploadStat = {
  key: "total" | "found" | "inFlight" | "notFound" | "eligible";
  label: string;
  tone?: "good" | "warning" | "accent";
};

const STATS: readonly UploadStat[] = [
  { key: "total", label: "Imported" },
  { key: "found", label: "Email found", tone: "good" },
  { key: "inFlight", label: "In progress", tone: "accent" },
  { key: "notFound", label: "Not found", tone: "warning" },
  { key: "eligible", label: "Eligible to enrich" },
];

/** Only leads without an email address are sent to enrichment. */
function isEnrichable(lead: Lead): boolean {
  return !lead.email && lead.emailStatus !== "suppressed";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

export function LeadsWorkspace({ leads, imports }: { leads: Lead[]; imports: LeadImport[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedImportId, setSelectedImportId] = useState("all");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [industry, setIndustry] = useState("all");
  const [location, setLocation] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);

  const industries = useMemo(() => unique(leads.map((lead) => lead.industry)), [leads]);
  const locations = useMemo(() => unique(leads.map((lead) => lead.location)), [leads]);
  const uploadLeads = useMemo(
    () => (selectedImportId === "all" ? leads : leads.filter((lead) => lead.importIds?.includes(selectedImportId))),
    [leads, selectedImportId],
  );
  const selectedUpload = imports.find((item) => item.importId === selectedImportId);
  const uploadStats = useMemo(
    () => ({
      total: uploadLeads.length,
      found: uploadLeads.filter((lead) => lead.emailStatus === "email_found").length,
      inFlight: uploadLeads.filter((lead) => lead.emailStatus === "queued" || lead.emailStatus === "processing").length,
      notFound: uploadLeads.filter((lead) => lead.emailStatus === "not_found").length,
      eligible: uploadLeads.filter(isEnrichable).length,
    }),
    [uploadLeads],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return uploadLeads.filter((lead) => {
      if (status !== "all" && lead.emailStatus !== status) return false;
      if (industry !== "all" && lead.industry !== industry) return false;
      if (location !== "all" && lead.location !== location) return false;
      if (!needle) return true;
      return [lead.name, lead.company, lead.jobTitle, lead.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [uploadLeads, search, status, industry, location]);

  const selection = allFilteredSelected ? filtered : filtered.filter((lead) => selectedIds.includes(lead.leadId));
  const eligible = selection.filter(isEnrichable);
  const campaignReady = selection.filter(
    (lead) => Boolean(lead.email) && lead.emailStatus === "email_found" && !lead.activeCampaignId,
  );
  const skippedHasEmail = selection.filter((lead) => Boolean(lead.email));
  const skippedSuppressed = selection.filter((lead) => lead.emailStatus === "suppressed");

  function toggleLead(leadId: string) {
    setAllFilteredSelected(false);
    setSelectedIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId],
    );
  }

  function togglePage() {
    setAllFilteredSelected(false);
    const pageIds = filtered.map((lead) => lead.leadId);
    const allOnPage = pageIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allOnPage ? [] : pageIds);
  }

  function clearSelection() {
    setSelectedIds([]);
    setAllFilteredSelected(false);
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportMessage(null);
    setImportError(null);

    const form = new FormData();
    form.append("file", file);

    const response = await fetch("/api/leads/import", {
      method: "POST",
      body: form,
    });

    setImporting(false);

    const result = (await response.json().catch(() => null)) as
      | { inserted?: number; updated?: number; rejected?: number; error?: string }
      | null;

    if (!response.ok) {
      setImportError(result?.error ?? "Lead import failed");
      return;
    }

    setImportMessage(
      `${result?.inserted ?? 0} inserted, ${result?.updated ?? 0} updated, ${result?.rejected ?? 0} rejected.`,
    );
    router.refresh();
  }

  async function findEmails() {
    setEnriching(true);
    setEnrichmentMessage(null);
    setEnrichmentError(null);

    const response = await fetch("/api/enrichment-batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadIds: eligible.map((lead) => lead.leadId) }),
    });

    setEnriching(false);

    const result = (await response.json().catch(() => null)) as
      | { batchId?: string; queued?: number; skipped?: number; error?: string }
      | null;

    if (!response.ok) {
      setEnrichmentError(result?.error ?? "Email finding failed");
      return;
    }

    setEnrichmentMessage(
      `Batch ${result?.batchId}: ${result?.queued ?? 0} queued, ${result?.skipped ?? 0} skipped.`,
    );
    clearSelection();
    router.refresh();
  }

  function createCampaign() {
    router.push(`/campaigns/new?leadIds=${encodeURIComponent(campaignReady.map((lead) => lead.leadId).join(","))}`);
  }

  const pageChecked = filtered.length > 0 && filtered.every((lead) => selection.includes(lead));

  return (
    <>
      <input id="lead-csv-file" type="file" accept=".csv,text/csv" onChange={importCsv} hidden />

      <div className="workspace-full">
        {importError || importMessage || importing || enrichmentError || enrichmentMessage ? (
          <div className="stack workspace-notices">
            {importError ? (
              <Notice tone="warning" icon={<IconUpload />}>
                {importError}
              </Notice>
            ) : null}

            {importMessage ? (
              <Notice tone="accent" icon={<IconUpload />}>
                Import complete: {importMessage}
              </Notice>
            ) : null}

            {importing ? (
              <Notice tone="accent" icon={<IconUpload />}>
                Importing CSV...
              </Notice>
            ) : null}

            {enrichmentError ? (
              <Notice tone="warning" icon={<IconLeads />}>
                {enrichmentError}
              </Notice>
            ) : null}

            {enrichmentMessage ? (
              <Notice tone="accent" icon={<IconLeads />}>
                Email finding queued: {enrichmentMessage}
              </Notice>
            ) : null}
          </div>
        ) : null}

        {/* One dense strip rather than four tall tiles — the table is what needs the height. */}
        <section className="stat-strip">
          <div className="stat-strip-head">
            <h2>Upload overview</h2>
            <p>{selectedUpload ? selectedUpload.fileName : "All uploads"}</p>
          </div>

          <dl className="stat-row">
            {STATS.map((stat) => (
              <div key={stat.key} className="stat">
                <dt>
                  {stat.tone ? <span className={`stat-dot stat-dot-${stat.tone}`} aria-hidden /> : null}
                  {stat.label}
                </dt>
                <dd>{uploadStats[stat.key].toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="filter-bar workspace-filters">
          <div className="search-field filter-search">
            <IconSearch />
            <input
              className="input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company or job title"
              aria-label="Search leads"
            />
          </div>

          <select
            className="select"
            value={selectedImportId}
            onChange={(event) => {
              setSelectedImportId(event.target.value);
              clearSelection();
            }}
            aria-label="Upload"
          >
            <option value="all">All uploads</option>
            {imports.map((item) => (
              <option key={item.importId} value={item.importId}>
                {item.fileName}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value as LeadStatus | "all")}
            aria-label="Email status"
          >
            <option value="all">All email statuses</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS[value].label}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            aria-label="Industry"
          >
            <option value="all">All industries</option>
            {industries.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            aria-label="Location"
          >
            <option value="all">All locations</option>
            {locations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {selection.length > 0 ? (
          <div className="bulk-bar">
            <strong className="num">{selection.length.toLocaleString()}</strong>
            <span>selected</span>
            <span className="subtle">
              {eligible.length.toLocaleString()} eligible for enrichment ·{" "}
              {skippedHasEmail.length.toLocaleString()} already have an email ·{" "}
              {skippedSuppressed.length.toLocaleString()} suppressed
            </span>
            <div className="spacer" />
            {!allFilteredSelected && filtered.length > selection.length ? (
              <button type="button" className="btn btn-ghost" onClick={() => setAllFilteredSelected(true)}>
                Select all {filtered.length.toLocaleString()} filtered
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={clearSelection}>
              Clear
            </button>
            {campaignReady.length > 0 ? (
              <button type="button" className="btn btn-primary" onClick={createCampaign}>
                Create campaign for {campaignReady.length.toLocaleString()}
              </button>
            ) : null}
            {eligible.length > 0 ? (
              <button type="button" className="btn btn-secondary" onClick={findEmails} disabled={enriching}>
                {enriching ? "Queuing..." : `Find emails for ${eligible.length.toLocaleString()}`}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="leads-table-pane">
          {leads.length === 0 ? (
            <EmptyState
              icon={<IconLeads />}
              title="No leads imported yet"
              description="Import an Apollo CSV export to populate this workspace. Enrichment runs from here once leads exist."
              action={
                <label htmlFor="lead-csv-file" className="btn btn-primary">
                  <IconUpload />
                  Import CSV
                </label>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState small title="No leads match these filters" description="Adjust or clear the filters above." />
          ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" className="col-select">
                      <input
                        type="checkbox"
                        checked={pageChecked}
                        onChange={togglePage}
                        aria-label="Select all leads on this page"
                      />
                    </th>
                    <th scope="col">Lead</th>
                    <th scope="col">Company</th>
                    <th scope="col">Industry</th>
                    <th scope="col">Location</th>
                    <th scope="col">Email</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <tr key={lead.leadId}>
                      <td className="col-select">
                        <input
                          type="checkbox"
                          checked={selection.includes(lead)}
                          onChange={() => toggleLead(lead.leadId)}
                          aria-label={`Select ${lead.name}`}
                        />
                      </td>
                      <td>
                        <div className="cell-strong">{lead.name}</div>
                        <div className="cell-sub">{lead.jobTitle}</div>
                      </td>
                      <td>
                        <div>{lead.company}</div>
                        <div className="cell-sub">{lead.employees} employees</div>
                      </td>
                      <td>{lead.industry}</td>
                      <td>{lead.location}</td>
                      <td>{lead.email ?? <span className="subtle">—</span>}</td>
                      <td>
                        <StatusPill {...LEAD_STATUS[lead.emailStatus]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          )}
        </div>
      </div>
    </>
  );
}
