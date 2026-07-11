import "server-only";

import { readFileSync } from "node:fs";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { getServerEnv } from "@/lib/env/server";

function parsePrivateKey(privateKey: string | undefined) {
  return privateKey?.replace(/\\n/g, "\n");
}

function getCredential() {
  const env = getServerEnv();

  if (env.firebaseServiceAccountJson) {
    return cert(JSON.parse(env.firebaseServiceAccountJson));
  }

  if (env.firebaseServiceAccountFile) {
    return cert(JSON.parse(readFileSync(env.firebaseServiceAccountFile, "utf8")));
  }

  if (env.firebaseClientEmail && env.firebasePrivateKey) {
    return cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: parsePrivateKey(env.firebasePrivateKey),
    });
  }

  return applicationDefault();
}

export function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const env = getServerEnv();

  return initializeApp({
    credential: getCredential(),
    projectId: env.firebaseProjectId,
    storageBucket: env.firebaseStorageBucket,
  });
}

export const adminAuth = () => getAuth(getFirebaseAdminApp());
export const adminDb = () => getFirestore(getFirebaseAdminApp());
export const adminStorage = () => getStorage(getFirebaseAdminApp());
