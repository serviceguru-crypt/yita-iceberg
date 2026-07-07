"use client";

import { IconPrinter } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} type="button" variant="outline">
      <IconPrinter />
      {label}
    </Button>
  );
}
