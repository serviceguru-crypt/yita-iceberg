"use client";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";

import { getFirebaseServices } from "@/lib/firebase/client";

export async function callFunction<TInput, TOutput>(
  name: string,
  input: TInput,
) {
  const callable = httpsCallable<TInput, TOutput>(
    getFirebaseServices().functions,
    name,
  );

  try {
    const result = await callable(input);
    return result.data;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new Error(error.message || "Unable to complete request.");
    }

    throw error;
  }
}
