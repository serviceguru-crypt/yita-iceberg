import { ReleaseCompleteClient } from "@/components/release/release-client";

export default async function ReleaseOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <ReleaseCompleteClient orderId={orderId} />;
}
