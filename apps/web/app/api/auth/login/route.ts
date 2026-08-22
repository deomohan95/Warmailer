import { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE, loginIdentifierToEmail } from "@/lib/auth";
import { requireSupabaseConfig } from "@/lib/backend-data";
import { isPublicHttpsRequest, publicRequestUrl } from "@/lib/request-url";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = loginIdentifierToEmail(String(form.get("identifier") ?? ""));
  const password = String(form.get("password") ?? "");
  const { url, key } = requireSupabaseConfig();

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: key,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!auth.ok) return NextResponse.redirect(publicRequestUrl("/login?error=1", request));

  const session = (await auth.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const response = NextResponse.redirect(publicRequestUrl("/", request));
  const secure = isPublicHttpsRequest(request);
  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: session.expires_in,
  });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
