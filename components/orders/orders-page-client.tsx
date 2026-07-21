"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons-react";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/status-badges";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { orderStatuses, type OrderStatus } from "@/lib/domain/order-state";
import { callFunction } from "@/lib/firebase/callables";
import { formatNairaFromKobo } from "@/lib/format/number";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { OrderDocument } from "@/lib/types/operational";
import { timestampLabel } from "@/lib/types/operational";

const filterStatuses = orderStatuses.filter((status) => status !== "draft");

type OrdersResponse = {
  ok?: boolean;
  message?: string;
  orders?: OrderDocument[];
};

export function OrdersPageClient() {
  return (
    <BranchRequired>
      <OrdersContent />
    </BranchRequired>
  );
}

function OrdersContent() {
  const { selectedBranch, selectedBranchId, user } = useBranchContext();
  const canApprove = ["branch_manager", "admin", "super_admin"].includes(
    user.platformRole,
  );
  const [status, setStatus] = useState<OrderStatus | "all">(
    canApprove ? "awaiting_discount_approval" : "awaiting_payment",
  );
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    if (!selectedBranchId) return;
    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams({
        branchId: selectedBranchId,
        status,
      });
      const response = await fetch(`/api/orders?${searchParams}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json()) as OrdersResponse;

      if (!response.ok || !result.ok || !Array.isArray(result.orders)) {
        throw new Error(result.message || "Unable to load orders for this branch.");
      }

      setOrders(result.orders);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load orders for this branch.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [selectedBranchId, status]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [
        order.orderNumber,
        order.customerSnapshot?.name,
        order.createdByName,
        order.discountRequest?.requestedByName,
      ].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [orders, search]);

  async function decideDiscount(orderId: string, decision: "approved" | "rejected") {
    const reason =
      decision === "rejected"
        ? window.prompt("Reason for rejecting this discount")
        : window.prompt("Approval note", "Approved");
    if (!reason) return;

    try {
      await callFunction("approveDiscount", {
        orderId,
        decision,
        reason,
        idempotencyKey: createIdempotencyKey(`discount-${decision}`),
      });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update discount.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {canApprove ? "Orders & approvals" : "Orders"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {canApprove
              ? `${selectedBranch?.name} orders and negotiated discount decisions`
              : `${selectedBranch?.name} operational queue`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canApprove ? (
            <Button
              onClick={() => setStatus("awaiting_discount_approval")}
              type="button"
              variant={status === "awaiting_discount_approval" ? "default" : "outline"}
            >
              Discount approvals
            </Button>
          ) : null}
          <Button onClick={() => void loadOrders()} type="button" variant="outline">
            <IconRefresh />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/orders/new">
              <IconPlus />
              New order
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[220px_1fr]">
        <label className="grid gap-1 text-sm font-medium">
          <span>Status</span>
          <select
            className="h-9 rounded-md border bg-background px-3"
            onChange={(event) => setStatus(event.target.value as OrderStatus | "all")}
            value={status}
          >
            <option value="all">All bounded orders</option>
            {filterStatuses.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          <span>Order number search</span>
          <input
            className="h-9 rounded-md border bg-background px-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="YI-..."
            value={search}
          />
        </label>
      </div>

      {error ? (
        <OperationState actionLabel="Retry" detail={error} onAction={() => void loadOrders()} title="Order queue unavailable" />
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Staff</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleOrders.map((order) => (
              <tr key={order.id}>
                <td className="px-3 py-2 font-medium">{order.orderNumber}</td>
                <td className="px-3 py-2">
                  {order.customerSnapshot?.name || (order.customerType === "walk_in" ? "Walk-in" : "Registered customer")}
                </td>
                <td className="px-3 py-2"><OrderStatusBadge status={order.status} /></td>
                <td className="px-3 py-2"><PaymentStatusBadge status={order.paymentStatus} /></td>
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {order.discountRequest?.requestedByName || order.createdByName || "Staff member"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.status === "awaiting_discount_approval" ? "Requested discount" : "Created order"}
                  </p>
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatNairaFromKobo(order.grandTotalKobo)}</td>
                <td className="px-3 py-2">{timestampLabel(order.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/orders/${order.id}`}>Open</Link>
                    </Button>
                    {order.status === "awaiting_payment" ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/orders/${order.id}/edit`}>Edit</Link>
                      </Button>
                    ) : null}
                    {canApprove && order.status === "awaiting_discount_approval" ? (
                      <>
                        <Button size="sm" onClick={() => void decideDiscount(order.id, "approved")} type="button">
                          Approve
                        </Button>
                        <Button size="sm" onClick={() => void decideDiscount(order.id, "rejected")} type="button" variant="destructive">
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && visibleOrders.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>
                  No orders found for this branch and filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading orders...</p> : null}
    </div>
  );
}
