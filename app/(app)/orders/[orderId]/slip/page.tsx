import { OrderSlipClient } from "@/components/orders/order-slip-client";

export default async function OrderSlipPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <OrderSlipClient orderId={orderId} />;
}
