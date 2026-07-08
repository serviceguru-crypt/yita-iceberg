import { ReversalApprovalClient } from "@/components/reversals/reversals-client";

export default async function ReversalApprovalPage({
  params,
}: {
  params: Promise<{ reversalId: string }>;
}) {
  const { reversalId } = await params;
  return <ReversalApprovalClient reversalId={reversalId} />;
}
