import { describe, expect, it } from "vitest";

import { parseLeadCsv } from "../lib/lead-import";

describe("lead CSV import", () => {
  it("accepts the Apollo header and parses rows", () => {
    expect(
      parseLeadCsv(
        "source_file,name,job_title,company,link,location,employees,industry\napollo.csv,Jane Doe,Owner,Acme,https://www.linkedin.com/in/jane/,NY,10,Cleaning\n",
      ).accepted,
    ).toMatchObject([
      {
        source_file: "apollo.csv",
        name: "Jane Doe",
        company: "Acme",
        linkedin_url_normalized: "https://www.linkedin.com/in/jane",
        name_company_normalized: "jane doe::acme",
      },
    ]);
  });

  it("accepts only the needed lead columns", () => {
    expect(
      parseLeadCsv("name,link,company\nJane Doe,https://www.linkedin.com/in/jane/,Acme\n").accepted,
    ).toMatchObject([
      {
        name: "Jane Doe",
        company: "Acme",
        linkedin_url_normalized: "https://www.linkedin.com/in/jane",
        location: null,
      },
    ]);
  });

  it("rejects only when the needed columns are missing", () => {
    expect(() => parseLeadCsv("name,company\nJane,Acme\n")).toThrow("CSV header must include name,link,company");
  });
});
