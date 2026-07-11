import { cn } from "@/lib/utils";

export function CrystalMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-grid place-items-center overflow-hidden rounded-sm border border-white/25 bg-gradient-to-br from-white via-[#dceaf7] to-[#071426] shadow-[0_0_30px_rgba(220,234,247,0.24)]",
        className,
      )}
    >
      <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_34%,rgba(255,255,255,0.68)_35%,transparent_36%_64%,rgba(200,164,93,0.5)_65%,transparent_66%)]" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#c8a45d] to-transparent" />
      <span className="size-1/2 rotate-45 border border-white/55 bg-[#071426]/70" />
    </span>
  );
}
