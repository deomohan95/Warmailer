import { buildLeadIdentity, normalizeLinkedInProfileUrl } from "./normalization.mjs";

const CANONICAL_HEADERS = [
  "source_file",
  "name",
  "job_title",
  "company",
  "link",
  "location",
  "employees",
  "industry",
];

export function parseApolloCsv(csvText) {
  const records = parseCsvRecords(csvText);
  if (records.length === 0) {
    throw new Error("CSV is empty.");
  }

  const headers = records[0].map((header, index) => normalizeHeader(index === 0 ? header.replace(/^\uFEFF/, "") : header));
  const missing = CANONICAL_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`missing canonical columns: ${missing.join(", ")}`);
  }

  const warnings = headers
    .filter((header) => header && !CANONICAL_HEADERS.includes(header))
    .map((header) => ({ type: "unknown_header", header }));

  const rows = [];
  const rejections = [];

  for (let recordIndex = 1; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (record.every((value) => String(value ?? "").trim() === "")) continue;

    const row = {};
    headers.forEach((header, columnIndex) => {
      if (CANONICAL_HEADERS.includes(header)) {
        row[header] = String(record[columnIndex] ?? "").trim();
      }
    });

    const linkedinUrlNormalized = normalizeLinkedInProfileUrl(row.link);
    const identityKey = buildLeadIdentity(row);
    if (!row.name || !identityKey) {
      rejections.push({
        rowNumber: recordIndex + 1,
        reason: "A usable row needs name and either a valid LinkedIn profile URL or company.",
      });
      continue;
    }

    rows.push({
      sourceFile: row.source_file,
      name: row.name,
      jobTitle: row.job_title,
      company: row.company,
      link: row.link,
      location: row.location,
      employees: row.employees,
      industry: row.industry,
      linkedinUrlNormalized,
      identityKey,
    });
  }

  return { rows, rejections, warnings };
}

function normalizeHeader(header) {
  return String(header ?? "").trim().toLowerCase();
}

function parseCsvRecords(input) {
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  record.push(field.replace(/\r$/, ""));
  if (record.length > 1 || record[0] !== "") {
    records.push(record);
  }

  return records;
}

