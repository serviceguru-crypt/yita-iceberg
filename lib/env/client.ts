import { z } from "zod";

const firebaseClientEnvSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
  measurementId: z.string().optional(),
});

const clientRuntimeEnvSchema = z.object({
  useFirebaseEmulators: z.boolean(),
  enableAppCheck: z.boolean(),
  appCheckDebugToken: z.string().optional(),
});

function readBoolean(value: string | undefined) {
  return value === "true";
}

export function getFirebaseClientEnv() {
  return firebaseClientEnvSchema.parse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  });
}

export function getClientRuntimeEnv() {
  return clientRuntimeEnvSchema.parse({
    useFirebaseEmulators: readBoolean(
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    ),
    enableAppCheck: readBoolean(process.env.NEXT_PUBLIC_ENABLE_APP_CHECK),
    appCheckDebugToken: process.env.NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN,
  });
}
