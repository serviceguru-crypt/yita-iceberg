import { redirect } from "next/navigation";
import Image from "next/image";

import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentUser } from "@/lib/server/auth/session";

export default async function SignInPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-sm space-y-8">
        <div className="space-y-4 text-center">
          <Image
            alt="YITA Iceberg"
            className="mx-auto h-auto w-56"
            height={1254}
            priority
            src="/brand/yita-iceberg-logo.webp"
            width={1254}
          />
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
