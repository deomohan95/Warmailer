import assert from "node:assert/strict";
import { test } from "node:test";
import { planLeadImport } from "../src/import-plan.mjs";

test("plans insert, update, and rejected row actions with final counters", () => {
  const rows = [
    {
      rowNumber: 2,
      sourceFile: "apollo.csv",
      name: "Jane Doe",
      jobTitle: "VP Sales",
      company: "Acme",
      link: "https://www.linkedin.com/in/jane-doe",
      location: "NY",
      employees: "51-200",
      industry: "SaaS",
      linkedinUrlNormalized: "https://www.linkedin.com/in/jane-doe",
      identityKey: "linkedin:https://www.linkedin.com/in/jane-doe",
    },
    {
      rowNumber: 3,
      sourceFile: "apollo.csv",
      name: "John Smith",
      jobTitle: "Founder",
      company: "Beta Labs",
      link: "",
      location: "Remote",
      employees: "11-50",
      industry: "AI",
      linkedinUrlNormalized: null,
      identityKey: "name_company:john smith|beta labs",
    },
  ];
  const existingLeads = [
    {
      id: "lead-1",
      workspaceId: "workspace-1",
      name: "Jane Doe",
      jobTitle: "Director",
      company: "Acme",
      email: "jane@acme.test",
      linkedinUrlNormalized: "https://www.linkedin.com/in/jane-doe",
      nameCompanyNormalized: "jane doe|acme",
      location: "SF",
      employees: "",
      industry: "",
    },
  ];
  const rejectedRows = [{ rowNumber: 4, reason: "missing identity" }];

  const plan = planLeadImport({ workspaceId: "workspace-1", rows, rejectedRows, existingLeads });

  assert.deepEqual(plan.counters, {
    totalRows: 3,
    acceptedRows: 2,
    rejectedRows: 1,
    insertedRows: 1,
    updatedRows: 1,
  });
  assert.equal(plan.rowActions[0].action, "updated");
  assert.equal(plan.rowActions[0].lead.email, "jane@acme.test");
  assert.equal(plan.rowActions[0].lead.jobTitle, "VP Sales");
  assert.equal(plan.rowActions[1].action, "inserted");
  assert.equal(plan.rowActions[1].lead.nameCompanyNormalized, "john smith|beta labs");
  assert.equal(plan.rowActions[2].action, "rejected");
});

test("different LinkedIn URLs are never merged by matching name and company", () => {
  const plan = planLeadImport({
    workspaceId: "workspace-1",
    rows: [
      {
        rowNumber: 2,
        name: "Jane Doe",
        company: "Acme",
        link: "https://www.linkedin.com/in/jane-new",
        linkedinUrlNormalized: "https://www.linkedin.com/in/jane-new",
        identityKey: "linkedin:https://www.linkedin.com/in/jane-new",
      },
    ],
    rejectedRows: [],
    existingLeads: [
      {
        id: "lead-1",
        workspaceId: "workspace-1",
        name: "Jane Doe",
        company: "Acme",
        linkedinUrlNormalized: "https://www.linkedin.com/in/jane-old",
        nameCompanyNormalized: "jane doe|acme",
      },
    ],
  });

  assert.equal(plan.rowActions[0].action, "inserted");
  assert.equal(plan.rowActions[0].lead.linkedinUrlNormalized, "https://www.linkedin.com/in/jane-new");
});

test("dedupe is scoped to the active workspace", () => {
  const plan = planLeadImport({
    workspaceId: "workspace-1",
    rows: [
      {
        rowNumber: 2,
        name: "Jane Doe",
        company: "Acme",
        link: "https://www.linkedin.com/in/jane-doe",
        linkedinUrlNormalized: "https://www.linkedin.com/in/jane-doe",
        identityKey: "linkedin:https://www.linkedin.com/in/jane-doe",
      },
    ],
    rejectedRows: [],
    existingLeads: [
      {
        id: "other-workspace-lead",
        workspaceId: "workspace-2",
        name: "Jane Doe",
        company: "Acme",
        linkedinUrlNormalized: "https://www.linkedin.com/in/jane-doe",
      },
    ],
  });

  assert.equal(plan.rowActions[0].action, "inserted");
});

