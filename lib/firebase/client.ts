"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from "firebase/app-check";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

import { getClientRuntimeEnv, getFirebaseClientEnv } from "@/lib/env/client";

let emulatorsConnected = false;
let appCheckInitialized = false;

export function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(getFirebaseClientEnv());
}

export function getFirebaseServices(): {
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
} {
  const app = getFirebaseApp();
  const runtimeEnv = getClientRuntimeEnv();
  const clientEnv = getFirebaseClientEnv();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, runtimeEnv.defaultFunctionRegion);
  const storage = getStorage(app);

  if (
    typeof window !== "undefined" &&
    runtimeEnv.enableAppCheck &&
    !runtimeEnv.useFirebaseEmulators &&
    !appCheckInitialized
  ) {
    if (!clientEnv.appCheckSiteKey) {
      throw new Error("App Check site key is required when App Check is enabled.");
    }
    if (runtimeEnv.appCheckDebugToken) {
      Object.assign(window, {
        FIREBASE_APPCHECK_DEBUG_TOKEN: runtimeEnv.appCheckDebugToken,
      });
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(clientEnv.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  }

  if (
    typeof window !== "undefined" &&
    runtimeEnv.useFirebaseEmulators &&
    !emulatorsConnected
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    emulatorsConnected = true;
  }

  return { auth, db, functions, storage };
}
