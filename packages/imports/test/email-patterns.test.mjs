import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyEmailPattern,
  detectEmailPattern,
  emailDomain,
  isBusinessDomain,
  normalizeCompanyKey,
  splitPersonName,
} from "../src/email-patterns.mjs";

test("normalizes company keys for cache lookup", () => {
  assert.equal(normalizeCompanyKey(" Acme Property Management, LLC "), "acme");
});

test("splits first and last names for pattern matching", () => {
  assert.deepEqual(splitPersonName("Jane Mary Doe"), { first: "jane", last: "doe" });
  assert.equal(splitPersonName("Prince"), null);
});

test("detects common business email patterns", () => {
  assert.equal(detectEmailPattern({ name: "John Smith", email: "john.smith@acme.com" }), "first.last");
  assert.equal(detectEmailPattern({ name: "John Smith", email: "jsmith@acme.com" }), "flast");
  assert.equal(detectEmailPattern({ name: "John Smith", email: "johns@acme.com" }), "firstl");
  assert.equal(detectEmailPattern({ name: "John Smith", email: "johnsmith@acme.com" }), "firstlast");
});

test("rejects free domains and one-word names", () => {
  assert.equal(emailDomain("Jane@Gmail.com"), "gmail.com");
  assert.equal(isBusinessDomain("gmail.com"), false);
  assert.equal(detectEmailPattern({ name: "Jane Doe", email: "jane.doe@gmail.com" }), null);
  assert.equal(applyEmailPattern({ name: "Jane", domain: "acme.com", pattern: "first.last" }), null);
});

test("applies known patterns to new names", () => {
  assert.equal(applyEmailPattern({ name: "Jane Doe", domain: "acme.com", pattern: "first.last" }), "jane.doe@acme.com");
  assert.equal(applyEmailPattern({ name: "Jane Doe", domain: "acme.com", pattern: "flast" }), "jdoe@acme.com");
});
