import { AdjustmentDetailClient } from "@/components/inventory/inventory-client";

export default async function InventoryAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  return <AdjustmentDetailClient requestId={requestId} />;
}
