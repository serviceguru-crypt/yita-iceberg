import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentUser } from "@/lib/server/auth/session";

export default async function SignInPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/profile");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            YITA Iceberg
          </p>
          <h1 className="text-3xl font-semibold tracking-normal">Sign in</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Staff accounts are created by an administrator.
          </p>
        </div>
        <SignInForm />
      </section>
    </main>
  );
}
