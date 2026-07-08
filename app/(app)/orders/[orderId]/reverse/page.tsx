import { NewReversalClient } from "@/components/reversals/reversals-client";

export default async function OrderReversePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <NewReversalClient orderId={orderId} />;
}
