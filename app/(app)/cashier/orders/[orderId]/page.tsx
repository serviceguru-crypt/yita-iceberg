import { PaymentClient } from "@/components/cashier/cashier-client";

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <PaymentClient orderId={orderId} />;
}
