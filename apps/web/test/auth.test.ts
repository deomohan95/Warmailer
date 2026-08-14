import { describe, expect, it, vi } from "vitest";

import { loginIdentifierToEmail, MYMAIDSPRO_LOGIN_EMAIL, refreshSupabaseSession } from "../lib/auth";

describe("auth login identifiers", () => {
  it("maps the MyMaidsPro username to the Supabase auth email", () => {
    expect(loginIdentifierToEmail(" infomymaidspro ")).toBe(MYMAIDSPRO_LOGIN_EMAIL);
  });

  it("leaves real email addresses usable for future client accounts", () => {
    expect(loginIdentifierToEmail("owner@example.com")).toBe("owner@example.com");
  });

  it("refreshes an access token from a refresh token", async () => {
    const fetchAuth = vi.fn().mockResolvedValue(
      Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }),
    );

    await expect(
      refreshSupabaseSession(
        "old-refresh",
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        },
        fetchAuth,
      ),
    ).resolves.toEqual({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });

    expect(fetchAuth).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/token?grant_type=refresh_token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "anon-key" }),
        body: JSON.stringify({ refresh_token: "old-refresh" }),
      }),
    );
  });
});
