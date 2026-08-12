import { LEAD_CSV_HEADER } from "./types";

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
};

export type RejectedLeadCsvRow = {
  rowNumber: number;
  raw: Record<string, string>;
  reason: string;
};

const HEADERS = LEAD_CSV_HEADER.split(",");

export function parseLeadCsv(text: string): { accepted: ParsedLeadCsvRow[]; rejected: RejectedLeadCsvRow[] } {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((cell) => cell.replace(/^\uFEFF/, "").trim()) ?? [];
  if (header.join(",") !== LEAD_CSV_HEADER) throw new Error(`CSV header must be ${LEAD_CSV_HEADER}`);

  const accepted: ParsedLeadCsvRow[] = [];
  const rejected: RejectedLeadCsvRow[] = [];

  rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.every((cell) => !cell.trim())) return;

    const raw = Object.fromEntries(HEADERS.map((key, cellIndex) => [key, (cells[cellIndex] ?? "").trim()]));
    const name = raw.name ?? "";
    const company = raw.company || null;
    const linkedin = normalizeLinkedin(raw.link ?? "");
    const nameCompany = name && company ? `${normalizeText(name)}::${normalizeText(company)}` : null;

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
      link: raw.link || null,
      linkedin_url_normalized: linkedin,
      name_company_normalized: nameCompany,
      location: raw.location || null,
      employees: raw.employees || null,
      industry: raw.industry || null,
    });
  });

  return { accepted, rejected };
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

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
