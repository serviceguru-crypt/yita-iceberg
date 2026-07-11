import Link from "next/link";

import { CrystalMark } from "@/components/brand/crystal-mark";
import { YitaLogo } from "@/components/brand/yita-logo";

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#071426] px-4 py-12 text-white sm:px-6 md:py-16 lg:px-8 lg:py-24">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(220,234,247,0.20),transparent_28%),radial-gradient(circle_at_76%_12%,rgba(200,164,93,0.18),transparent_24%),linear-gradient(140deg,#071426_0%,#0b1020_48%,#101b2d_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#c8a45d]/70 to-transparent" />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="max-w-3xl space-y-8">
          <YitaLogo imageClassName="w-56 sm:w-64 md:hidden" />
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#dceaf7]">
            <span className="size-1.5 rounded-full bg-[#c8a45d]" />
            Luxury jewelry operations
          </div>
          <div className="space-y-6">
            <h1 className="font-display text-5xl leading-[0.95] tracking-normal text-balance sm:text-6xl lg:text-7xl">
              Precision Jewelry Trading, Secured from Stock to Sale.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[#dceaf7]/86 sm:text-xl">
              YITA Iceberg combines luxury jewelry commerce with controlled
              inventory, payment verification, release approval, and
              branch-level oversight.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#c8a45d] px-6 text-sm font-semibold text-[#071426] shadow-[0_16px_44px_rgba(200,164,93,0.28)] transition hover:bg-[#e6d3a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6d3a3]"
              href="/sign-in"
            >
              Enter Secure Portal
            </Link>
            <a
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/18 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:border-[#c8a45d]/60 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dceaf7]"
              href="#workflow"
            >
              Explore the Platform
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute inset-8 rounded-full bg-[#dceaf7]/10 blur-3xl" />
          <div className="relative rounded-[2rem] border border-white/12 bg-white/[0.055] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur">
            <div className="rounded-[1.5rem] border border-white/12 bg-[#08182d]/85 p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <YitaLogo imageClassName="hidden w-48 md:block" />
                <span className="rounded-full border border-[#c8a45d]/35 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#e6d3a3]">
                  Preview Only
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {["Stock locked", "Payment checked", "Release approved", "Audit ready"].map((label, index) => (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4" key={label}>
                    <CrystalMark className="mb-4 size-8 rotate-45" />
                    <p className="text-sm text-white">{label}</p>
                    <p className="mt-2 text-xs leading-5 text-[#dceaf7]/65">
                      Step {index + 1} control point in a secure jewelry sale.
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-[#c8a45d]/25 bg-[#c8a45d]/10 p-4">
                <p className="text-sm font-medium text-[#e6d3a3]">Sample Branch</p>
                <p className="mt-2 text-xs leading-5 text-[#dceaf7]/70">
                  Demo Order moves only after payment and release verification.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
