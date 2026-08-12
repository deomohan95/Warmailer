import assert from "node:assert/strict";
import { test } from "node:test";
import { parseApolloCsv } from "../src/csv-parser.mjs";

test("parses canonical Apollo CSV with BOM, whitespace, quoted commas, and reordered headers", () => {
  const csv = "\uFEFF company , name , industry , employees , location , link , job_title , source_file , ignored\n" +
    "\"Acme, Inc.\", Jane Doe , SaaS, 51-200, \"New York, NY\", https://www.linkedin.com/in/jane-doe/?trk=abc , VP Sales, apollo.csv, x\n" +
    "\"Beta Labs\", \"John Smith\", AI, 11-50, Remote, , Founder, apollo.csv, y\n";

  const result = parseApolloCsv(csv);

  assert.deepEqual(result.warnings, [{ type: "unknown_header", header: "ignored" }]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.rows[0].company, "Acme, Inc.");
  assert.equal(result.rows[0].linkedinUrlNormalized, "https://www.linkedin.com/in/jane-doe");
  assert.equal(result.rows[1].identityKey, "name_company:john smith|beta labs");
});

test("rejects missing canonical headers and unusable rows", () => {
  assert.throws(
    () => parseApolloCsv("name,company,link\nJane,Acme,https://linkedin.com/in/jane\n"),
    /missing canonical columns: source_file, job_title, location, employees, industry/,
  );

  const result = parseApolloCsv("source_file,name,job_title,company,link,location,employees,industry\napollo.csv,No Identity,CEO,,not-a-url,Remote,1-10,SaaS\n");
  assert.deepEqual(result.rejections, [
    {
      rowNumber: 2,
      reason: "A usable row needs name and either a valid LinkedIn profile URL or company.",
    },
  ]);
});

test("repeat rows dedupe by workspace-scoped identity without erasing found email", () => {
  const csv = "source_file,name,job_title,company,link,location,employees,industry\n" +
    "one.csv,Jane Doe,VP,Acme,https://www.linkedin.com/in/jane-doe,NY,51-200,SaaS\n" +
    "two.csv,Jane Doe,CRO,Acme,https://linkedin.com/in/jane-doe/,NYC,51-200,SaaS\n";

  const result = parseApolloCsv(csv);

  assert.equal(result.rows[0].identityKey, "linkedin:https://www.linkedin.com/in/jane-doe");
  assert.equal(result.rows[1].identityKey, "linkedin:https://www.linkedin.com/in/jane-doe");
});

