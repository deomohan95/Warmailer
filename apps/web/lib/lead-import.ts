export type ParsedLeadCsvRow = {
  rowNumber: number;
  raw: Record<string, string>;
  source_file: string | null;
  name: string;
  job_title: string | null;
  company: string | null;
  link: string | null;
  linkedin_url_normalized: string | null;
  name_company_normalized: string | null;
  location: string | null;
  employees: string | null;
  industry: string | null;
  email: string | null;
  email_status: "found" | "verified" | null;
};

export type RejectedLeadCsvRow = {
  rowNumber: number;
  raw: Record<string, string>;
  reason: string;
};

export type LeadImportLinkLookupRow = {
  import_id: string;
  lead_id: string | null;
};

const REQUIRED_HEADERS = ["name", "company"];

export function parseLeadCsv(text: string): { accepted: ParsedLeadCsvRow[]; rejected: RejectedLeadCsvRow[] } {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((cell) => cell.replace(/^\uFEFF/, "").trim().toLowerCase()) ?? [];
  const missing = REQUIRED_HEADERS.filter((key) => !header.includes(key));
  if (!header.includes("link") && !header.includes("linkedin_url")) missing.push("link");
  if (missing.length) throw new Error("CSV header must include name,link,company");

  const accepted: ParsedLeadCsvRow[] = [];
  const rejected: RejectedLeadCsvRow[] = [];

  rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.every((cell) => !cell.trim())) return;

    const raw = Object.fromEntries(header.map((key, cellIndex) => [key, (cells[cellIndex] ?? "").trim()]));
    const name = raw.name ?? "";
    const company = raw.company || null;
    const link = raw.link || raw.linkedin_url || "";
    const linkedin = normalizeLinkedin(link);
    const nameCompany = name && company ? `${normalizeText(name)}::${normalizeText(company)}` : null;
    const email = normalizeEmail(raw.email);

    if (!name || (!linkedin && !company)) {
      rejected.push({ rowNumber, raw, reason: "Name plus LinkedIn URL or company is required" });
      return;
    }

    accepted.push({
      rowNumber,
      raw,
      source_file: raw.source_file || null,
      name,
      job_title: raw.job_title || null,
      company,
      link: link || null,
      linkedin_url_normalized: linkedin,
      name_company_normalized: nameCompany,
      location: raw.location || null,
      employees: raw.employees || null,
      industry: raw.industry || null,
      email,
      email_status: email ? emailStatus(raw) : null,
    });
  });

  return { accepted, rejected };
}

export function duplicateImportIdForLeadIds(rows: LeadImportLinkLookupRow[], leadIds: string[]): string | null {
  const expected = new Set(leadIds);
  if (expected.size === 0) return null;

  const byImport = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.lead_id || !expected.has(row.lead_id)) continue;
    const leadSet = byImport.get(row.import_id) ?? new Set<string>();
    leadSet.add(row.lead_id);
    byImport.set(row.import_id, leadSet);
  }

  for (const [importId, importedLeadIds] of byImport) {
    if (importedLeadIds.size === expected.size) return importId;
  }

  return null;
}

export function leadUpdatePatch(lead: ParsedLeadCsvRow, updatedAt: string) {
  const patch: Record<string, string | null> = {
    name: lead.name,
    job_title: lead.job_title,
    company: lead.company,
    link: lead.link,
    linkedin_url_normalized: lead.linkedin_url_normalized,
    name_company_normalized: lead.name_company_normalized,
    location: lead.location,
    employees: lead.employees,
    industry: lead.industry,
    updated_at: updatedAt,
  };
  if (lead.email) {
    patch.email = lead.email;
    patch.email_status = lead.email_status ?? "found";
    patch.last_enriched_at = updatedAt;
  }
  return patch;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeLinkedin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    if (host !== "linkedin.com" || !path.startsWith("/in/")) return null;
    return `https://www.linkedin.com${path.toLowerCase()}`;
  } catch {
    return null;
  }
}

function normalizeEmail(value?: string): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function emailStatus(raw: Record<string, string>): "found" | "verified" {
  const explicit = (raw.email_status || raw.status || raw.reoon_status || "").trim().toLowerCase();
  if (["verified", "safe", "valid", "deliverable"].includes(explicit)) return "verified";
  if (String(raw.reoon_is_safe_to_send ?? "").trim().toLowerCase() === "true") return "verified";
  return "found";
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
