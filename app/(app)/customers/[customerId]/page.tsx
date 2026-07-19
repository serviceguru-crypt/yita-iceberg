import { CustomerDetailClient } from "@/components/customers/customers-client";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetailClient customerId={customerId} />;
}
