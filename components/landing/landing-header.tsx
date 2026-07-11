import Link from "next/link";

import { YitaLogo } from "@/components/brand/yita-logo";

const navItems = [
  { href: "#workflow", label: "Workflow" },
  { href: "#platform", label: "Platform" },
  { href: "#security", label: "Security" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#071426]/82 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link aria-label="YITA Iceberg home" className="flex items-center" href="/">
          <YitaLogo compact showImage={false} />
        </Link>
        <nav aria-label="Landing page" className="hidden items-center gap-7 text-sm text-white/70 md:flex">
          {navItems.map((item) => (
            <a className="transition hover:text-white" href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#c8a45d]/45 bg-[#c8a45d] px-5 text-sm font-semibold text-[#071426] shadow-[0_12px_36px_rgba(200,164,93,0.25)] transition hover:bg-[#e6d3a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6d3a3]"
          href="/sign-in"
        >
          Enter Secure Portal
        </Link>
      </div>
    </header>
  );
}
