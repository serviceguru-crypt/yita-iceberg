import { StockCountDetailClient } from "@/components/inventory/inventory-client";

export default async function StockCountDetailPage({
  params,
}: {
  params: Promise<{ stockCountId: string }>;
}) {
  const { stockCountId } = await params;

  return <StockCountDetailClient stockCountId={stockCountId} />;
}
