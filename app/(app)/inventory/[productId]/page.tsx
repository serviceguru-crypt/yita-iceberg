import { InventoryDetailClient } from "@/components/inventory/inventory-client";

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;

  return <InventoryDetailClient productId={productId} />;
}
