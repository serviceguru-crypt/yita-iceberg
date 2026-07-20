"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { genericSignInError } from "@/lib/auth/errors";
import { getFirebaseServices } from "@/lib/firebase/client";
import { signInSchema } from "@/lib/validation/user";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = signInSchema.safeParse({ email, password });

    if (!parsed.success) {
      setError(genericSignInError);
      return;
    }

    setIsSubmitting(true);

    try {
      const { auth } = getFirebaseServices();
      const credential = await signInWithEmailAndPassword(
        auth,
        parsed.data.email,
        parsed.data.password,
      );
      const idToken = await credential.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        await signOut(auth);
        throw new Error("Session denied");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(genericSignInError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
          id="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
