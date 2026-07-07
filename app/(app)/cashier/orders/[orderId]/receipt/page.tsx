import { PaymentReceiptClient } from "@/components/cashier/cashier-client";

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <PaymentReceiptClient orderId={orderId} />;
}
