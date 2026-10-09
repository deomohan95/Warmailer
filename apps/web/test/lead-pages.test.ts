import { afterEach, expect, it, vi } from "vitest";

import { getLeadPage } from "../lib/lead-pages";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("queries only the requested lead page with server-side filters", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-key");
  const fetchMock = vi.fn().mockResolvedValue(Response.json([
    { id: "lead_1", name: "Jane", job_title: "Owner", company: "Acme", location: "US", employees: "10", industry: "Services", email: "jane@example.com", email_status: "found" },
  ], { headers: { "content-range": "100-100/1234" } }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await getLeadPage("workspace_1", { search: "Jane", status: "email_found", importId: "import_1" }, 2);
  expect(result).toMatchObject({ total: 1234, page: 2, leads: [{ leadId: "lead_1", emailStatus: "email_found" }] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const url = new URL(fetchMock.mock.calls[0]![0]);
  expect(url.searchParams.get("limit")).toBe("100");
  expect(url.searchParams.get("offset")).toBe("100");
  expect(url.searchParams.get("email_status")).toBe("eq.found");
  expect(url.searchParams.get("lead_import_rows.import_id")).toBe("eq.import_1");
  expect(url.searchParams.get("or")).toContain("name.ilike.*Jane*");
});

it("does not treat all as an industry or location filter", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-key");
  const fetchMock = vi.fn().mockResolvedValue(Response.json([], { headers: { "content-range": "0-0/0" } }));
  vi.stubGlobal("fetch", fetchMock);

  await getLeadPage("workspace_1", { industry: "all", location: "all" });

  const url = new URL(fetchMock.mock.calls[0]![0]);
  expect(url.searchParams.has("industry")).toBe(false);
  expect(url.searchParams.has("location")).toBe(false);
});
