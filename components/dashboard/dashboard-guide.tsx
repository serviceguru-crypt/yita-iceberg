"use client";

import Link from "next/link";
import {
  type ComponentType,
  type SVGProps,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  IconArrowRight,
  IconBuildingStore,
  IconCash,
  IconChartBar,
  IconCheck,
  IconChevronLeft,
  IconClipboardList,
  IconDiamond,
  IconHelpCircle,
  IconLockAccess,
  IconPackage,
  IconShieldCheck,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import type { PlatformRole } from "@/lib/domain/roles";

type GuideIcon = ComponentType<SVGProps<SVGSVGElement>>;

type GuideStep = {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: GuideIcon;
};

type RoleGuide = {
  label: string;
  headline: string;
  summary: string;
  primaryHref: string;
  primaryAction: string;
  steps: [GuideStep, GuideStep, GuideStep];
};

export const roleGuides: Record<PlatformRole, RoleGuide> = {
  order_registrar: {
    label: "Order registrar",
    headline: "Turn a customer request into a verified order",
    summary: "Build the order, confirm the negotiated price, and issue the slip that moves the customer to payment.",
    primaryHref: "/orders/new",
    primaryAction: "Create order",
    steps: [
      { title: "Confirm the branch", description: "Use the active branch selector before serving the customer.", href: "/dashboard", action: "View dashboard", icon: IconBuildingStore },
      { title: "Identify the customer", description: "Find an existing customer or register their details for the order.", href: "/customers", action: "Open customers", icon: IconUsers },
      { title: "Register the order", description: "Add products, confirm pricing, and issue the QR-coded order slip.", href: "/orders/new", action: "Create order", icon: IconClipboardList },
    ],
  },
  cashier: {
    label: "Cashier",
    headline: "Verify the order and record a trusted payment",
    summary: "Confirm the customer order, capture the payment method and evidence, then issue the payment receipt.",
    primaryHref: "/cashier",
    primaryAction: "Open payment queue",
    steps: [
      { title: "Confirm the branch", description: "Make sure the active branch matches the payment desk you are operating.", href: "/dashboard", action: "View dashboard", icon: IconBuildingStore },
      { title: "Find the order", description: "Open the payment queue and verify the order slip or QR code.", href: "/cashier", action: "Open queue", icon: IconClipboardList },
      { title: "Receive payment", description: "Record cash, transfer, POS, split, or approved credit and issue the receipt.", href: "/cashier", action: "Receive payment", icon: IconCash },
    ],
  },
  release_verifier: {
    label: "Release verifier",
    headline: "Release only fully verified paid orders",
    summary: "Check the payment record and receipt mark, confirm the order identity, and complete the stock release.",
    primaryHref: "/release",
    primaryAction: "Open release queue",
    steps: [
      { title: "Confirm the branch", description: "Work only from the branch currently selected in the app header.", href: "/dashboard", action: "View dashboard", icon: IconBuildingStore },
      { title: "Locate the paid order", description: "Scan the QR code or open an order awaiting release from the queue.", href: "/release", action: "Open queue", icon: IconClipboardList },
      { title: "Verify and release", description: "Validate payment and the receipt mark before recording the final handover.", href: "/release", action: "Verify release", icon: IconShieldCheck },
    ],
  },
  branch_manager: {
    label: "Branch manager",
    headline: "Keep the branch workflow and stock under control",
    summary: "Monitor each POS stage, resolve exceptions, maintain stock, and review branch performance.",
    primaryHref: "/inventory",
    primaryAction: "Open inventory",
    steps: [
      { title: "Select the branch", description: "Choose the branch whose queues and stock you need to manage.", href: "/dashboard", action: "View dashboard", icon: IconBuildingStore },
      { title: "Review operations", description: "Check orders, payments, releases, and any exceptions requiring attention.", href: "/orders", action: "Review orders", icon: IconClipboardList },
      { title: "Control stock", description: "Receive inventory, count stock, and review adjustment or reversal requests.", href: "/inventory", action: "Open inventory", icon: IconPackage },
    ],
  },
  admin: {
    label: "Admin",
    headline: "Run every company workflow from one place",
    summary: "Configure branches and staff, control products and stock, and oversee company-wide sales and finances.",
    primaryHref: "/reports",
    primaryAction: "Open reports",
    steps: [
      { title: "Build the operation", description: "Create branches, maintain the catalog, and allocate stock to each location.", href: "/branches", action: "Manage branches", icon: IconDiamond },
      { title: "Assign the team", description: "Invite staff, choose their roles, and limit them to the correct branches.", href: "/access", action: "Manage access", icon: IconLockAccess },
      { title: "Oversee performance", description: "Review sales, payments, inventory value, exceptions, and staff activity.", href: "/reports", action: "Open reports", icon: IconChartBar },
    ],
  },
  super_admin: {
    label: "Super admin",
    headline: "Configure and oversee the complete YITA platform",
    summary: "Maintain ultimate access while supporting the owner, branches, users, controls, and operational reporting.",
    primaryHref: "/access",
    primaryAction: "Manage access",
    steps: [
      { title: "Verify company setup", description: "Confirm branches, product controls, and stock allocation are configured.", href: "/branches", action: "Review branches", icon: IconBuildingStore },
      { title: "Control privileged access", description: "Invite users, assign roles, and maintain admin and super-admin access.", href: "/access", action: "Manage access", icon: IconLockAccess },
      { title: "Monitor the platform", description: "Use reports and audit views to review activity across all branches.", href: "/reports", action: "Open reports", icon: IconChartBar },
    ],
  },
};

function guideStorageKey(uid: string, role: PlatformRole) {
  return `yita:dashboard-guide:v1:${uid}:${role}`;
}

export function DashboardGuide({ role, uid }: { role: PlatformRole; uid: string }) {
  const guide = roleGuides[role];
  const storageKey = useMemo(() => guideStorageKey(uid, role), [role, uid]);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) !== "complete") {
      setOpen(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") setStepIndex((value) => Math.min(value + 1, guide.steps.length - 1));
      if (event.key === "ArrowLeft") setStepIndex((value) => Math.max(value - 1, 0));
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [guide.steps.length, open]);

  function finish() {
    window.localStorage.setItem(storageKey, "complete");
    setOpen(false);
    setStepIndex(0);
  }

  function showGuide() {
    setStepIndex(0);
    setOpen(true);
  }

  const step = guide.steps[stepIndex];
  const StepIcon = step.icon;
  const lastStep = stepIndex === guide.steps.length - 1;

  return (
    <>
      <Button onClick={showGuide} type="button" variant="outline">
        <IconHelpCircle />Guide
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6">
          <section
            aria-describedby="dashboard-guide-description"
            aria-labelledby="dashboard-guide-title"
            aria-modal="true"
            className="bottom-more-sheet liquid-glass w-full border-t p-5 shadow-2xl sm:max-w-xl sm:rounded-xl sm:border"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{guide.label} guide</p>
                <h2 className="mt-1 text-xl font-semibold" id="dashboard-guide-title">{guide.headline}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground" id="dashboard-guide-description">{guide.summary}</p>
              </div>
              <Button aria-label="Close guide" onClick={finish} size="icon" type="button" variant="ghost">
                <IconX />
              </Button>
            </div>

            <div aria-label={`Step ${stepIndex + 1} of ${guide.steps.length}`} className="mt-5 grid grid-cols-3 gap-2">
              {guide.steps.map((item, index) => (
                <button
                  aria-current={index === stepIndex ? "step" : undefined}
                  className="group flex min-w-0 items-center gap-2 border-t-2 pt-3 text-left transition-colors aria-[current=step]:border-primary aria-[current=step]:text-foreground"
                  key={item.title}
                  onClick={() => setStepIndex(index)}
                  type="button"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold group-aria-[current=step]:bg-primary group-aria-[current=step]:text-primary-foreground">
                    {index < stepIndex ? <IconCheck className="size-3.5" /> : index + 1}
                  </span>
                  <span className="hidden truncate text-xs font-medium sm:block">{item.title}</span>
                </button>
              ))}
            </div>

            <div className="my-7 flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
                <StepIcon className="size-6" />
              </span>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">STEP {stepIndex + 1}</p>
                <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Button disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)} type="button" variant="ghost">
                <IconChevronLeft />Previous
              </Button>
              {lastStep ? (
                <Button asChild>
                  <Link href={step.href} onClick={finish}>{step.action}<IconArrowRight /></Link>
                </Button>
              ) : (
                <Button onClick={() => setStepIndex((value) => value + 1)} type="button">
                  Next<IconArrowRight />
                </Button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function RoleWorkflowOverview({ role }: { role: PlatformRole }) {
  const guide = roleGuides[role];

  return (
    <section className="border-y bg-card/55 px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{guide.label} workflow</p>
          <h2 className="mt-1 text-lg font-semibold">{guide.headline}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.summary}</p>
        </div>
        <Button asChild>
          <Link href={guide.primaryHref}>{guide.primaryAction}<IconArrowRight /></Link>
        </Button>
      </div>
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {guide.steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <li className="flex gap-3 md:border-l md:pl-4 first:md:border-l-0 first:md:pl-0" key={step.title}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <StepIcon className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">{index + 1} OF 3</p>
                <p className="mt-0.5 font-medium">{step.title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
