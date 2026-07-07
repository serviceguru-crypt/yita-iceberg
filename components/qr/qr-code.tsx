"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ payload }: { payload: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    }).then((value) => {
      if (mounted) setSrc(value);
    });

    return () => {
      mounted = false;
      setSrc(null);
    };
  }, [payload]);

  if (!src) {
    return <div className="size-48 rounded-lg border bg-muted" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="Order verification QR code"
      className="size-48 rounded-lg border bg-white p-2"
      src={src}
    />
  );
}
