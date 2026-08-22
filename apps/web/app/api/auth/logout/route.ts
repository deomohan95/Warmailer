import { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { publicRequestUrl } from "@/lib/request-url";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(publicRequestUrl("/login", request));
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
