"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

import { BranchRequired } from "@/components/branch/branch-required";
import { useBranchContext } from "@/components/branch/branch-context";
import { Field } from "@/components/shared/field";
import { OperationState } from "@/components/shared/operation-state";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/firebase/callables";
import { getFirebaseServices } from "@/lib/firebase/client";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { CustomerDocument } from "@/lib/types/operational";

export function CustomersClient({ mode }: { mode: "list" | "new" }) {
  return (
    <BranchRequired>
      {mode === "list" ? <CustomerList /> : <CustomerNew />}
    </BranchRequired>
  );
}

function CustomerList() {
  const { selectedBranchId } = useBranchContext();
  const [customers, setCustomers] = useState<CustomerDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadCustomers() {
    if (!selectedBranchId) return;
    try {
      const snapshot = await getDocs(
        query(
          collection(getFirebaseServices().db, "customers"),
          where("branchId", "==", selectedBranchId),
          where("isActive", "==", true),
          limit(50),
        ),
      );
      setCustomers(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CustomerDocument, "id">) })));
    } catch {
      setError("Unable to load customers.");
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, [selectedBranchId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Customers</h1>
          <p className="text-sm text-muted-foreground">Registered customers for the active branch.</p>
        </div>
        <Button asChild><Link href="/customers/new">New customer</Link></Button>
      </div>
      {error ? <OperationState detail={error} title="Customer list unavailable" /> : null}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {customers.map((customer) => (
          <div className="rounded-lg border bg-card p-4" key={customer.id}>
            <p className="font-medium">{customer.name}</p>
            <p className="text-sm text-muted-foreground">{customer.phone}</p>
            {customer.address ? <p className="mt-2 text-sm">{customer.address}</p> : null}
            <Button asChild className="mt-3" size="sm" variant="outline">
              <Link href={`/customers/${customer.id}`}>Edit</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  return (
    <BranchRequired>
      <CustomerDetail customerId={customerId} />
    </BranchRequired>
  );
}

function CustomerDetail({ customerId }: { customerId: string }) {
  const { selectedBranchId } = useBranchContext();
  const [customer, setCustomer] = useState<CustomerDocument | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCustomer() {
    if (!selectedBranchId) return;
    const snapshot = await getDoc(doc(getFirebaseServices().db, "customers", customerId));
    if (!snapshot.exists()) throw new Error("Customer not found.");
    const next = { id: snapshot.id, ...(snapshot.data() as Omit<CustomerDocument, "id">) };
    if (next.branchId !== selectedBranchId) throw new Error("This customer belongs to another branch.");
    setCustomer(next);
    setName(next.name);
    setPhone(next.phone);
    setAddress(next.address ?? "");
  }

  useEffect(() => {
    void loadCustomer().catch((err) =>
      setError(err instanceof Error ? err.message : "Unable to load customer."),
    );
  }, [customerId, selectedBranchId]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await callFunction("updateCustomer", {
        customerId,
        name,
        phone,
        address,
        idempotencyKey: createIdempotencyKey("update-customer"),
      });
      setMessage("Customer details updated.");
      await loadCustomer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update customer.");
    } finally {
      setSaving(false);
    }
  }

  if (!customer && !error) return <OperationState title="Loading customer" />;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-normal">Customer details</h1>
        <Button asChild variant="outline"><Link href="/customers">Back</Link></Button>
      </div>
      {message ? <OperationState detail={message} title="Customer updated" /> : null}
      {error ? <OperationState detail={error} title="Customer unavailable" /> : null}
      {customer ? (
        <div className="grid gap-3 rounded-lg border bg-card p-4">
          <Field label="Name"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setName(event.target.value)} value={name} /></Field>
          <Field label="Phone"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setPhone(event.target.value)} value={phone} /></Field>
          <Field label="Address"><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" onChange={(event) => setAddress(event.target.value)} value={address} /></Field>
          <Button disabled={saving || !name.trim() || !phone.trim()} onClick={() => void save()} type="button">
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CustomerNew() {
  const { selectedBranchId } = useBranchContext();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selectedBranchId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await callFunction<Record<string, unknown>, { customerId: string }>(
        "createCustomer",
        {
          branchId: selectedBranchId,
          name,
          phone,
          ...(address.trim() ? { address } : {}),
          idempotencyKey: createIdempotencyKey("customer"),
        },
      );
      setResult(created.customerId);
      setName("");
      setPhone("");
      setAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-normal">New customer</h1>
        <Button asChild variant="outline"><Link href="/customers">Back</Link></Button>
      </div>
      {result ? <OperationState detail={`Customer ${result} created.`} title="Customer saved" /> : null}
      {error ? <OperationState detail={error} title="Action failed" /> : null}
      <div className="grid gap-3 rounded-lg border bg-card p-4">
        <Field label="Name"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setName(event.target.value)} value={name} /></Field>
        <Field label="Phone"><input className="h-9 rounded-md border bg-background px-3" onChange={(event) => setPhone(event.target.value)} value={phone} /></Field>
        <Field label="Address"><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" onChange={(event) => setAddress(event.target.value)} value={address} /></Field>
        <Button disabled={saving || !name.trim() || !phone.trim()} onClick={() => void submit()} type="button">
          {saving ? "Saving..." : "Create customer"}
        </Button>
      </div>
    </div>
  );
}
