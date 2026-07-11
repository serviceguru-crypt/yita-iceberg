"use client";

import { useState } from "react";
import { IconPrinter } from "@tabler/icons-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";

export function QrPrintButton({
  label = "Print QR",
  payload,
}: {
  label?: string;
  payload: string;
}) {
  const [busy, setBusy] = useState(false);

  async function printQr() {
    setBusy(true);

    try {
      const src = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 520,
      });
      const printWindow = window.open("", "_blank", "width=560,height=640");

      if (!printWindow) {
        throw new Error("Unable to open print preview.");
      }

      printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>Print QR</title>
    <style>
      @page { margin: 10mm; }
      * { box-sizing: border-box; }
      html, body {
        min-height: 100%;
        margin: 0;
        background: white;
      }
      body {
        display: grid;
        place-items: center;
      }
      img {
        display: block;
        width: min(82vw, 360px);
        height: auto;
      }
      @media print {
        body { min-height: auto; }
      }
    </style>
  </head>
  <body>
    <img alt="Product QR code" src="${src}" />
    <script>
      const image = document.querySelector("img");
      image.addEventListener("load", () => {
        window.focus();
        setTimeout(() => window.print(), 120);
      });
    </script>
  </body>
</html>`);
      printWindow.document.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button disabled={busy} onClick={() => void printQr()} type="button" variant="outline">
      <IconPrinter />
      {busy ? "Preparing" : label}
    </Button>
  );
}
