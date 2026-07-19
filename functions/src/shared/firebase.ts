import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function ensureAdminApp() {
  if (getApps().length === 0) {
    initializeApp();
  }
}

export function adminAuth() {
  ensureAdminApp();
  return getAuth();
}

export function adminDb() {
  ensureAdminApp();
  return getFirestore();
}

export function adminStorageBucket() {
  ensureAdminApp();
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    (process.env.GCLOUD_PROJECT
      ? `${process.env.GCLOUD_PROJECT}.appspot.com`
      : "yita-iceberg.firebasestorage.app");

  return getStorage().bucket(bucketName);
}
