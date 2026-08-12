export function normalizeLinkedInProfileUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0].toLowerCase() !== "in") return null;

  return `https://www.linkedin.com/in/${parts[1].toLowerCase()}`;
}

export function normalizeNameCompany(name, company) {
  const normalizedName = normalizeIdentityPart(name);
  const normalizedCompany = normalizeIdentityPart(company);
  if (!normalizedName || !normalizedCompany) return null;
  return `${normalizedName}|${normalizedCompany}`;
}

export function buildLeadIdentity(row) {
  const linkedin = normalizeLinkedInProfileUrl(row.link);
  if (linkedin) return `linkedin:${linkedin}`;

  const nameCompany = normalizeNameCompany(row.name, row.company);
  return nameCompany ? `name_company:${nameCompany}` : null;
}

export function mergeLeadProfile(existing, incoming) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const next = typeof value === "string" ? value.trim() : value;
    if (next === "" || next == null) continue;
    if (key === "email" && existing.email) continue;
    merged[key] = next;
  }
  return merged;
}

function normalizeIdentityPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

