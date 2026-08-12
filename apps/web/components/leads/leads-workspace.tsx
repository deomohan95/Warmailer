"use client";

import { useMemo, useState } from "react";

import { IconLeads, IconSearch, IconUpload } from "@/components/icons";
import { Card, CardHead, EmptyState, Notice, StatusPill } from "@/components/ui/primitives";
import { LEAD_STATUS } from "@/lib/labels";
import { LEAD_CSV_HEADER, type Lead, type LeadImport, type LeadStatus } from "@/lib/types";

const STATUS_ORDER: LeadStatus[] = [
  "not_enriched",
  "queued",
  "processing",
  "email_found",
  "not_found",
  "failed",
  "suppressed",
];

/** Only leads without an email address are sent to enrichment. */
function isEnrichable(lead: Lead): boolean {
  return !lead.email && lead.emailStatus !== "suppressed";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

export function LeadsWorkspace({ leads, imports }: { leads: Lead[]; imports: LeadImport[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [industry, setIndustry] = useState("all");
  const [location, setLocation] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);

  const industries = useMemo(() => unique(leads.map((lead) => lead.industry)), [leads]);
  const locations = useMemo(() => unique(leads.map((lead) => lead.location)), [leads]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (status !== "all" && lead.emailStatus !== status) return false;
      if (industry !== "all" && lead.industry !== industry) return false;
      if (location !== "all" && lead.location !== location) return false;
      if (!needle) return true;
      return [lead.name, lead.company, lead.jobTitle, lead.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [leads, search, status, industry, location]);

  const selection = allFilteredSelected ? filtered : filtered.filter((lead) => selectedIds.includes(lead.leadId));
  const eligible = selection.filter(isEnrichable);
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

  const pageChecked = filtered.length > 0 && filtered.every((lead) => selection.includes(lead));

  return (
    <>
      <Card className="section">
        <div className="filter-bar">
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
            <button type="button" className="btn btn-primary" disabled={eligible.length === 0}>
              Find emails for {eligible.length.toLocaleString()}
            </button>
          </div>
        ) : null}

        <div className="card-body card-body-flush">
          {leads.length === 0 ? (
            <EmptyState
              icon={<IconLeads />}
              title="No leads imported yet"
              description="Import an Apollo CSV export to populate this workspace. Enrichment runs from here once leads exist."
              action={
                <button type="button" className="btn btn-primary">
                  <IconUpload />
                  Import CSV
                </button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState small title="No leads match these filters" description="Adjust or clear the filters above." />
          ) : (
            <div className="table-wrap">
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
            </div>
          )}
        </div>
      </Card>

      <div className="grid-2 section">
        <Card>
          <CardHead title="Imports" display />
          <div className="card-body">
            {imports.length === 0 ? (
              <EmptyState
                small
                title="No imports yet"
                description="The importer expects an Apollo export with this exact header row."
                action={<code className="tag">{LEAD_CSV_HEADER}</code>}
              />
            ) : (
              <div className="stack" style={{ gap: "var(--s-3)" }}>
                {imports.map((item) => (
                  <div key={item.importId} className="row" style={{ gap: "var(--s-3)" }}>
                    <div>
                      <div className="cell-strong">{item.fileName}</div>
                      <div className="cell-sub num">
                        {item.importedCount.toLocaleString()} imported · {item.duplicateCount.toLocaleString()}{" "}
                        duplicates
                      </div>
                    </div>
                    <div className="spacer" />
                    <StatusPill label={item.status === "completed" ? "Completed" : "In progress"} tone="neutral" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Finding emails" display />
          <div className="card-body stack" style={{ gap: "var(--s-3)" }}>
            <Notice tone="accent">
              Select leads above, then run <strong>Find emails</strong>. Leads that already have an address are skipped.
            </Notice>
            <ol className="stack muted" style={{ gap: 6, paddingLeft: 18, fontSize: 13 }}>
              <li>The primary single-link actor runs first for each eligible lead.</li>
              <li>Only leads the primary actor reported as a true not-found go to the fallback bulk actor.</li>
              <li>Results write back to the lead with the enrichment batch that produced them.</li>
            </ol>
            <p className="subtle" style={{ fontSize: 12.5 }}>
              No enrichment run has been started from this build — the actors are not called yet.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
