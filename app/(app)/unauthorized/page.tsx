import { SignOutButton } from "@/components/auth/sign-out-button";

export default function UnauthorizedPage() {
  return (
    <section className="max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">
          Access unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your account is inactive or does not have permission to use this
          system. Contact an administrator if this looks wrong.
        </p>
      </div>
      <SignOutButton />
    </section>
  );
}
