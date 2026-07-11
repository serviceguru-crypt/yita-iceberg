import { NextResponse } from "next/server";

import {
  createSessionCookie,
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  sessionCookieName,
} from "@/lib/server/auth/session";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { sessionSchema, userProfileSchema } from "@/lib/validation/user";

export async function POST(request: Request) {
  try {
    const body = sessionSchema.parse(await request.json());
    const decodedToken = await adminAuth().verifyIdToken(body.idToken);
    const userSnapshot = await adminDb().doc(`users/${decodedToken.uid}`).get();

    if (!userSnapshot.exists) {
      throw new Error("Missing user profile");
    }

    const profile = userProfileSchema.parse(userSnapshot.data());

    if (!profile.isActive) {
      throw new Error("Inactive user");
    }

    const sessionCookie = await createSessionCookie(body.idToken);
    const response = NextResponse.json({ ok: true });

    response.cookies.set(
      sessionCookieName,
      sessionCookie,
      getSessionCookieOptions(),
    );

    return response;
  } catch (error) {
    console.error("Session creation failed", error);

    const response = NextResponse.json(
      { ok: false, message: "Unable to create a session." },
      { status: 401 },
    );
    response.cookies.set(
      sessionCookieName,
      "",
      getClearSessionCookieOptions(),
    );
    return response;
  }
}
