import { YitaLogo } from "@/components/brand/yita-logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#071426] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <YitaLogo compact showImage={false} />
        <p className="text-sm text-[#dceaf7]/60">
          Secure jewelry trading operations for YITA Iceberg.
        </p>
      </div>
    </footer>
  );
}
