import Image from "next/image";

import { CrystalMark } from "@/components/brand/crystal-mark";
import { cn } from "@/lib/utils";

type YitaLogoProps = {
  className?: string;
  imageClassName?: string;
  markClassName?: string;
  showImage?: boolean;
  compact?: boolean;
};

export function YitaLogo({
  className,
  imageClassName,
  markClassName,
  showImage = true,
  compact = false,
}: YitaLogoProps) {
  if (showImage) {
    return (
      <Image
        alt="YITA Iceberg"
        className={cn("h-auto w-44", imageClassName, className)}
        height={1254}
        priority={compact}
        src="/brand/yita-iceberg-logo.webp"
        width={1254}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CrystalMark className={cn("size-10 rotate-45", markClassName)} />
      <div className="leading-none">
        <p className="font-display text-lg tracking-[0.22em] text-white">
          YITA <span className="text-[#c8a45d]">ICEBERG</span>
        </p>
        {!compact ? (
          <p className="mt-1 text-[0.62rem] uppercase tracking-[0.36em] text-white/55">
            Jewelry Trading
          </p>
        ) : null}
      </div>
    </div>
  );
}
