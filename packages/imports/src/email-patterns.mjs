const FREE_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

const LEGAL_WORDS = new Set([
  "llc",
  "inc",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "property",
  "properties",
  "management",
]);

export function normalizeCompanyKey(company) {
  const words = String(company ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !LEGAL_WORDS.has(word));
  return words.join(" ");
}

export function splitPersonName(name) {
  const parts = String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s'-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0], last: parts.at(-1) };
}

export function emailDomain(email) {
  const match = String(email ?? "").toLowerCase().match(/@([^@\s]+)$/);
  return match ? match[1] : null;
}

export function isBusinessDomain(domain) {
  const normalized = String(domain ?? "").toLowerCase();
  return Boolean(normalized) && !FREE_DOMAINS.has(normalized);
}

export function detectEmailPattern({ name, email }) {
  const domain = emailDomain(email);
  if (!isBusinessDomain(domain)) return null;
  const person = splitPersonName(name);
  if (!person) return null;
  const local = String(email).toLowerCase().split("@")[0];
  const patterns = {
    "first.last": `${person.first}.${person.last}`,
    flast: `${person.first[0]}${person.last}`,
    firstl: `${person.first}${person.last[0]}`,
    firstlast: `${person.first}${person.last}`,
  };
  return Object.entries(patterns).find(([, value]) => value === local)?.[0] ?? null;
}

export function applyEmailPattern({ name, domain, pattern }) {
  if (!isBusinessDomain(domain)) return null;
  const person = splitPersonName(name);
  if (!person) return null;
  const local =
    {
      "first.last": `${person.first}.${person.last}`,
      flast: `${person.first[0]}${person.last}`,
      firstl: `${person.first}${person.last[0]}`,
      firstlast: `${person.first}${person.last}`,
    }[pattern] ?? null;
  return local ? `${local}@${String(domain).toLowerCase()}` : null;
}
