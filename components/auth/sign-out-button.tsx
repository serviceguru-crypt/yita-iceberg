"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getFirebaseServices } from "@/lib/firebase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const { auth } = getFirebaseServices();
    await fetch("/api/auth/sign-out", { method: "POST" });
    await signOut(auth);
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Button onClick={handleSignOut} variant="outline">
      Sign out
    </Button>
  );
}
