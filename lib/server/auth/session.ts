import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { getServerEnv } from "@/lib/env/server";
import { userProfileSchema, type UserProfile } from "@/lib/validation/user";

export const sessionCookieName = getServerEnv().sessionCookieName;
const sessionDurationMs =
  getServerEnv().sessionCookieMaxAgeDays * 24 * 60 * 60 * 1000;

export async function createSessionCookie(idToken: string) {
  return adminAuth().createSessionCookie(idToken, {
    expiresIn: sessionDurationMs,
  });
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: sessionDurationMs / 1000,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getClearSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export type ActiveSessionUser = UserProfile & {
  uid: string;
};

export async function getCurrentUser({
  allowInactive = false,
}: {
  allowInactive?: boolean;
} = {}): Promise<ActiveSessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(sessionCookieName)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    const snapshot = await adminDb().doc(`users/${decoded.uid}`).get();

    if (!snapshot.exists) {
      return null;
    }

    const profile = userProfileSchema.parse(snapshot.data());

    if (!allowInactive && !profile.isActive) {
      return null;
    }

    return {
      uid: decoded.uid,
      ...profile,
    };
  } catch {
    return null;
  }
}

export async function requireActiveUser() {
  const user = await getCurrentUser();

  if (!user) {
    const inactiveOrMissingUser = await getCurrentUser({ allowInactive: true });
    redirect(inactiveOrMissingUser ? "/unauthorized" : "/sign-in");
  }

  return user;
}

export async function requireSessionUser() {
  const user = await getCurrentUser({ allowInactive: true });

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}
