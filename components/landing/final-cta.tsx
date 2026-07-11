import Link from "next/link";

export function FinalCta() {
  return (
    <section className="bg-[#071426] px-4 py-16 text-white sm:px-6 md:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.055] p-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.24)] md:p-12">
        <h2 className="font-display text-4xl leading-tight text-balance sm:text-5xl">
          Built for jewelry trading teams that need beauty, speed, and control.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#dceaf7]/72">
          Enter the secure portal to manage operations with the discipline expected of a premium trading house.
        </p>
        <Link
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#c8a45d] px-7 text-sm font-semibold text-[#071426] transition hover:bg-[#e6d3a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6d3a3]"
          href="/sign-in"
        >
          Enter Secure Portal
        </Link>
      </div>
    </section>
  );
}
