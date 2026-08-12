import { mergeLeadProfile } from "./normalization.mjs";

export function planLeadImport({ workspaceId, rows, rejectedRows, existingLeads }) {
  const existingByLinkedin = new Map();
  const existingByNameCompany = new Map();
  for (const lead of existingLeads) {
    if (lead.workspaceId !== workspaceId) continue;
    if (lead.linkedinUrlNormalized) {
      existingByLinkedin.set(lead.linkedinUrlNormalized, lead);
    } else if (lead.nameCompanyNormalized) {
      existingByNameCompany.set(lead.nameCompanyNormalized, lead);
    }
  }

  const plannedIdentity = new Set();
  const rowActions = [];
  let insertedRows = 0;
  let updatedRows = 0;

  for (const row of rows) {
    const nameCompanyNormalized = row.identityKey?.startsWith("name_company:")
      ? row.identityKey.slice("name_company:".length)
      : null;
    const existing = findExistingLead(row, nameCompanyNormalized, existingByLinkedin, existingByNameCompany);

    if (existing) {
      updatedRows += 1;
      rowActions.push({
        rowNumber: row.rowNumber,
        action: "updated",
        lead: mergeLeadProfile(existing, toLeadProfile(workspaceId, row, nameCompanyNormalized)),
      });
      continue;
    }

    if (plannedIdentity.has(row.identityKey)) {
      rowActions.push({
        rowNumber: row.rowNumber,
        action: "skipped",
        reason: "Duplicate row identity already planned in this import.",
      });
      continue;
    }

    plannedIdentity.add(row.identityKey);
    insertedRows += 1;
    rowActions.push({
      rowNumber: row.rowNumber,
      action: "inserted",
      lead: toLeadProfile(workspaceId, row, nameCompanyNormalized),
    });
  }

  for (const rejected of rejectedRows) {
    rowActions.push({
      rowNumber: rejected.rowNumber,
      action: "rejected",
      reason: rejected.reason,
    });
  }

  return {
    counters: {
      totalRows: rows.length + rejectedRows.length,
      acceptedRows: rows.length,
      rejectedRows: rejectedRows.length,
      insertedRows,
      updatedRows,
    },
    rowActions,
  };
}

function findExistingLead(row, nameCompanyNormalized, existingByLinkedin, existingByNameCompany) {
  if (row.linkedinUrlNormalized) {
    return existingByLinkedin.get(row.linkedinUrlNormalized) ?? null;
  }

  if (nameCompanyNormalized) {
    return existingByNameCompany.get(nameCompanyNormalized) ?? null;
  }

  return null;
}

function toLeadProfile(workspaceId, row, nameCompanyNormalized) {
  return {
    workspaceId,
    sourceFile: row.sourceFile,
    name: row.name,
    jobTitle: row.jobTitle,
    company: row.company,
    link: row.link,
    linkedinUrlNormalized: row.linkedinUrlNormalized,
    nameCompanyNormalized,
    location: row.location,
    employees: row.employees,
    industry: row.industry,
  };
}

