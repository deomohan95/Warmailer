import { describe, expect, it } from "vitest";

import { loginIdentifierToEmail, MYMAIDSPRO_LOGIN_EMAIL } from "../lib/auth";

describe("auth login identifiers", () => {
  it("maps the MyMaidsPro username to the Supabase auth email", () => {
    expect(loginIdentifierToEmail(" infomymaidspro ")).toBe(MYMAIDSPRO_LOGIN_EMAIL);
  });

  it("leaves real email addresses usable for future client accounts", () => {
    expect(loginIdentifierToEmail("owner@example.com")).toBe("owner@example.com");
  });
});
