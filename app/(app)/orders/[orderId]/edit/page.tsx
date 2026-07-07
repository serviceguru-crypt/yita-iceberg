import { OrderFormClient } from "@/components/orders/order-form-client";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <OrderFormClient mode="edit" orderId={orderId} />;
}
