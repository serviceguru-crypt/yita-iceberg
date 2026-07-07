import { NextResponse } from "next/server";

import {
  getClearSessionCookieOptions,
  sessionCookieName,
} from "@/lib/server/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", getClearSessionCookieOptions());
  return response;
}
