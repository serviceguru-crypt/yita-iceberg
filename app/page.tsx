import { Button } from "@/components/ui/button";

const foundationItems = [
  "Next.js App Router",
  "Tailwind CSS and shadcn/ui",
  "Firebase client and Admin SDK architecture",
  "Firestore and Storage rules baseline",
  "Cloud Functions v2 workspace",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="max-w-2xl space-y-8">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              YITA Iceberg
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-balance sm:text-5xl">
              Secure inventory and sales control foundation
            </h1>
            <p className="text-lg leading-8 text-muted-foreground">
              Phase 2 is focused on Firebase infrastructure, strict typing, and
              branch-safe architecture before operational screens are built.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {foundationItems.map((item) => (
              <div
                className="rounded-md border bg-card px-4 py-3 text-sm text-card-foreground"
                key={item}
              >
                {item}
              </div>
            ))}
          </div>

          <Button asChild>
            <a href="/sign-in">Sign in</a>
          </Button>
        </div>
      </section>
    </main>
  );
}
