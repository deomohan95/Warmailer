import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLeadIdentity,
  mergeLeadProfile,
  normalizeLinkedInProfileUrl,
  normalizeNameCompany,
} from "../src/normalization.mjs";

test("normalizes LinkedIn profile URLs without merging different profiles by name", () => {
  assert.equal(
    normalizeLinkedInProfileUrl("https://www.linkedin.com/in/Jane-Doe/?trk=public_profile"),
    "https://www.linkedin.com/in/jane-doe",
  );
  assert.equal(normalizeLinkedInProfileUrl("https://linkedin.com/in/jane-doe/"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(normalizeLinkedInProfileUrl("https://www.linkedin.com/company/acme"), null);
  assert.equal(normalizeLinkedInProfileUrl("not a url"), null);
});

test("uses LinkedIn identity first and name-company only when LinkedIn is absent", () => {
  assert.equal(
    buildLeadIdentity({ name: "Jane Doe", company: "Acme", link: "https://linkedin.com/in/jane" }),
    "linkedin:https://www.linkedin.com/in/jane",
  );
  assert.equal(
    buildLeadIdentity({ name: "Jane Doe", company: "Acme", link: "" }),
    "name_company:jane doe|acme",
  );
  assert.equal(normalizeNameCompany(" Jane   Doe ", " ACME, Inc. "), "jane doe|acme inc");
});

test("refreshes non-empty profile fields but never clears a known email", () => {
  const merged = mergeLeadProfile(
    { name: "Jane Doe", company: "Acme", email: "jane@acme.test", location: "NY" },
    { name: "", company: "Acme Corp", email: "", location: "San Francisco" },
  );

  assert.deepEqual(merged, {
    name: "Jane Doe",
    company: "Acme Corp",
    email: "jane@acme.test",
    location: "San Francisco",
  });
});

