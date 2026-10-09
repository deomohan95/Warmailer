"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { IconLeads, IconSearch, IconUpload } from "@/components/icons";
import { EmptyState, Notice, StatusPill } from "@/components/ui/primitives";
import { LEAD_STATUS } from "@/lib/labels";
import type { LeadPage, LeadPageItem, LeadStats } from "@/lib/lead-pages";
import type { LeadImport, LeadStatus } from "@/lib/types";

const PAGE_SIZE = 100;

const STATUS_ORDER: LeadStatus[] = [
  "not_enriched",
  "queued",
  "processing",
  "email_found",
  "verified",
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
function isEnrichable(lead: LeadPageItem): boolean {
  return !lead.email && lead.emailStatus !== "suppressed";
}

export function LeadsWorkspace({
  initialPage,
  imports,
  initialImportId,
}: {
  initialPage: LeadPage;
  imports: LeadImport[];
  initialImportId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialPage);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialized = useRef(false);
  const [search, setSearch] = useState("");
  const [selectedImportId, setSelectedImportId] = useState(initialImportId ?? "all");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [industry, setIndustry] = useState("all");
  const [location, setLocation] = useState("all");
  const [selectedRecords, setSelectedRecords] = useState<Record<string, LeadPageItem>>({});
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  useEffect(() => { setData(initialPage); }, [initialPage]);
  useEffect(() => {
    const controller = new AbortController();
    setStats(null);
    const params = new URLSearchParams({ statsOnly: "1" });
    if (selectedImportId !== "all") params.set("importId", selectedImportId);
    fetch(`/api/leads/query?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Could not load lead totals"); return response.json(); })
      .then((result: LeadStats) => setStats(result))
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load lead totals"); });
    return () => controller.abort();
  }, [selectedImportId]);
  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (industry && industry !== "all") params.set("industry", industry);
      if (location && location !== "all") params.set("location", location);
      if (selectedImportId !== "all") params.set("importId", selectedImportId);
      try {
        const response = await fetch(`/api/leads/query?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load leads (${response.status})`);
        const next = (await response.json()) as LeadPage;
        setData({ leads: next.leads, total: next.total, page: next.page });
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load leads");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [page, search, status, industry, location, selectedImportId]);

  const selectedUpload = imports.find((item) => item.importId === selectedImportId);
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageLeads = data.leads;
  const selection = Object.values(selectedRecords);
  const eligible = selection.filter(isEnrichable);
  const verifyReady = selection.filter((lead) => Boolean(lead.email) && lead.emailStatus === "email_found");
  const campaignReady = selection.filter(
    (lead) => Boolean(lead.email) && lead.emailStatus === "verified" && !lead.activeCampaignId,
  );
  const skippedHasEmail = selection.filter((lead) => Boolean(lead.email));
  const skippedSuppressed = selection.filter((lead) => lead.emailStatus === "suppressed");

  function toggleLead(leadId: string) {
    const lead = pageLeads.find((item) => item.leadId === leadId);
    if (!lead) return;
    setSelectedRecords((current) => {
      const next = { ...current };
      if (next[leadId]) delete next[leadId];
      else next[leadId] = lead;
      return next;
    });
  }

  function togglePage() {
    setSelectedRecords((current) => {
      const next = { ...current };
      const allOnPage = pageLeads.every((lead) => Boolean(next[lead.leadId]));
      for (const lead of pageLeads) {
        if (allOnPage) delete next[lead.leadId];
        else next[lead.leadId] = lead;
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedRecords({});
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
    setVerificationMessage(null);
    setVerificationError(null);

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

    setEnrichmentMessage(`In process: batch ${result?.batchId}, ${result?.queued ?? 0} queued, ${result?.skipped ?? 0} skipped.`);
    clearSelection();
    router.refresh();
  }

  async function verifyEmails() {
    setVerifying(true);
    setVerificationMessage(null);
    setVerificationError(null);
    setEnrichmentMessage(null);
    setEnrichmentError(null);

    const response = await fetch("/api/email-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadIds: verifyReady.map((lead) => lead.leadId) }),
    });

    setVerifying(false);

    const result = (await response.json().catch(() => null)) as
      | { verified?: number; notVerified?: number; failed?: number; skipped?: number; lastError?: string | null; error?: string }
      | null;

    if (!response.ok) {
      setVerificationError(result?.error ?? "Email verification failed");
      return;
    }

    setVerificationMessage(
      `${result?.verified ?? 0} verified, ${result?.notVerified ?? 0} not verified, ${result?.failed ?? 0} failed, ${result?.skipped ?? 0} skipped.${result?.lastError ? ` ${result.lastError}` : ""}`,
    );
    clearSelection();
    router.refresh();
  }

  function createCampaign() {
    router.push(`/campaigns/new?leadIds=${encodeURIComponent(campaignReady.map((lead) => lead.leadId).join(","))}`);
  }

  const pageChecked = pageLeads.length > 0 && pageLeads.every((lead) => Boolean(selectedRecords[lead.leadId]));

  return (
    <>
      <input id="lead-csv-file" type="file" accept=".csv,text/csv" onChange={importCsv} hidden />

      <div className="workspace-full">
        {importError ||
        importMessage ||
        importing ||
        enrichmentError ||
        enrichmentMessage ||
        verificationError ||
        verificationMessage ||
        verifying ? (
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

            {verificationError ? (
              <Notice tone="warning" icon={<IconLeads />}>
                {verificationError}
              </Notice>
            ) : null}

            {verifying ? (
              <Notice tone="accent" icon={<IconLeads />}>
                Email verification in process...
              </Notice>
            ) : null}

            {verificationMessage ? (
              <Notice tone="accent" icon={<IconLeads />}>
                Email verification complete: {verificationMessage}
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
                <dd>{stats ? stats[stat.key].toLocaleString() : "—"}</dd>
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
              onChange={(event) => { setSearch(event.target.value); setPage(1); clearSelection(); }}
              placeholder="Search name, company or job title"
              aria-label="Search leads"
            />
          </div>

          <select
            className="select"
            value={selectedImportId}
            onChange={(event) => {
              const importId = event.target.value;
              setSelectedImportId(importId);
              setPage(1);
              clearSelection();
              window.history.replaceState(null, "", importId === "all" ? "/leads" : `/leads?importId=${encodeURIComponent(importId)}`);
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
            onChange={(event) => { setStatus(event.target.value as LeadStatus | "all"); setPage(1); clearSelection(); }}
            aria-label="Email status"
          >
            <option value="all">All email statuses</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS[value].label}
              </option>
            ))}
          </select>

          <input className="input" value={industry} onChange={(event) => { setIndustry(event.target.value); setPage(1); clearSelection(); }} aria-label="Industry contains" placeholder="Industry contains" />
          <input className="input" value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); clearSelection(); }} aria-label="Location contains" placeholder="Location contains" />
        </div>

        {selection.length > 0 ? (
          <div className="bulk-bar">
            <strong className="num">{selection.length.toLocaleString()}</strong>
            <span>selected</span>
            <span className="subtle">
              {eligible.length.toLocaleString()} eligible for enrichment ·{" "}
              {verifyReady.length.toLocaleString()} ready to verify ·{" "}
              {skippedHasEmail.length.toLocaleString()} already have an email ·{" "}
              {skippedSuppressed.length.toLocaleString()} suppressed
            </span>
            <div className="spacer" />
            <button type="button" className="btn btn-ghost" onClick={clearSelection}>
              Clear
            </button>
            {campaignReady.length > 0 ? (
              <button type="button" className="btn btn-primary" onClick={createCampaign}>
                Create campaign for {campaignReady.length.toLocaleString()}
              </button>
            ) : null}
            {verifyReady.length > 0 ? (
              <button type="button" className="btn btn-primary" onClick={verifyEmails} disabled={verifying}>
                {verifying ? "Verifying..." : `Verify emails for ${verifyReady.length.toLocaleString()}`}
              </button>
            ) : null}
            {eligible.length > 0 ? (
              <button type="button" className="btn btn-primary" onClick={findEmails} disabled={enriching}>
                {enriching ? "Email finding in process..." : `Find emails for ${eligible.length.toLocaleString()}`}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="leads-table-pane">
          {loading ? <p className="subtle" role="status">Loading leads…</p> : null}
          {loadError ? <Notice tone="warning">{loadError}</Notice> : null}
          {stats?.total === 0 ? (
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
          ) : data.total === 0 ? (
            <EmptyState small title="No leads match these filters" description="Adjust or clear the filters above." />
          ) : (
              <div className="stack" style={{ gap: "var(--s-3)" }}>
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
                  {pageLeads.map((lead) => (
                    <tr key={lead.leadId}>
                      <td className="col-select">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedRecords[lead.leadId])}
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
              <nav className="row" aria-label="Lead pages" style={{ justifyContent: "space-between" }}>
                <span className="subtle">
                  Showing {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, data.total).toLocaleString()} of {data.total.toLocaleString()}
                </span>
                <div className="row">
                  <button type="button" className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
                  <span className="subtle">Page {currentPage} of {pageCount}</span>
                  <button type="button" className="btn btn-secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
                </div>
              </nav>
              </div>
          )}
        </div>
      </div>
    </>
  );
}
