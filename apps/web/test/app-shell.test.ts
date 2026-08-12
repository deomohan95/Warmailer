import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Warmailer app shell", () => {
  it("renders the operational dashboard entry point", async () => {
    const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

    expect(page).toContain("Warmailer");
    expect(page).toContain("Campaigns");
    expect(page).toContain("Leads");
    expect(page).toContain("Mailboxes");
    expect(page).not.toContain("HRMS");
  });
});
