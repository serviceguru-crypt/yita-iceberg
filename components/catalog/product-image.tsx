"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { IconDiamond } from "@tabler/icons-react";

import { getFirebaseServices } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

export function ProductImage({
  alt,
  path,
  version,
  className,
}: {
  alt: string;
  path?: string | null;
  version?: unknown;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const versionKey =
    typeof version === "string" || typeof version === "number"
      ? String(version)
      : JSON.stringify(version ?? "current");

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!path) return () => { active = false; };

    getDownloadURL(ref(getFirebaseServices().storage, path))
      .then((downloadUrl) => {
        if (!active) return;
        const separator = downloadUrl.includes("?") ? "&" : "?";
        setUrl(`${downloadUrl}${separator}v=${encodeURIComponent(versionKey)}`);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => { active = false; };
  }, [path, versionKey]);

  return (
    <div className={cn("relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground", className)}>
      {url ? (
        <Image alt={alt} className="object-cover" fill sizes="96px" src={url} unoptimized />
      ) : (
        <IconDiamond aria-hidden="true" className="size-7 opacity-55" />
      )}
    </div>
  );
}
