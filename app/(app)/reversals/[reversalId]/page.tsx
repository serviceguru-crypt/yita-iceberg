import { ReversalDetailClient } from "@/components/reversals/reversals-client";

export default async function ReversalDetailPage({
  params,
}: {
  params: Promise<{ reversalId: string }>;
}) {
  const { reversalId } = await params;
  return <ReversalDetailClient reversalId={reversalId} />;
}
