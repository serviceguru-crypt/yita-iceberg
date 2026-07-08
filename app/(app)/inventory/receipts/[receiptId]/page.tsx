import { StockReceiptDetailClient } from "@/components/inventory/inventory-client";

export default async function StockReceiptDetailPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;

  return <StockReceiptDetailClient receiptId={receiptId} />;
}
