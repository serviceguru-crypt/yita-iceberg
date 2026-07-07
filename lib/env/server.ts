import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  firebaseProjectId: z.string().min(1),
  firebaseClientEmail: z.string().optional(),
  firebasePrivateKey: z.string().optional(),
  firebaseServiceAccountJson: z.string().optional(),
  firebaseStorageBucket: z.string().optional(),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    firebaseProjectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    firebaseStorageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}
