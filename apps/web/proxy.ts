import { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_COOKIE_MAX_AGE, refreshSupabaseSession } from "./lib/auth";
import { isPublicHttpsRequest, publicRequestUrl } from "./lib/request-url";

function setSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string; expires_in: number },
  secure: boolean,
) {
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
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export async function proxy(request: NextRequest) {
  if (request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.next();

  const session = await refreshSupabaseSession(refreshToken).catch(() => null);
  if (!session) {
    const response = NextResponse.redirect(publicRequestUrl("/login", request));
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const response = NextResponse.redirect(
    publicRequestUrl(`${request.nextUrl.pathname}${request.nextUrl.search}`, request),
  );
  setSessionCookies(response, session, isPublicHttpsRequest(request));
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|login|signup).*)"],
};
