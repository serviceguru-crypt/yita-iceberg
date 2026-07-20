"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ComponentType,
  type SVGProps,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconCash,
  IconBuildingStore,
  IconClipboardList,
  IconDiamond,
  IconDots,
  IconLayoutDashboard,
  IconLockAccess,
  IconPackage,
  IconReceiptRefund,
  IconReportAnalytics,
  IconShieldCheck,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";

import type { PlatformRole } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: NavIcon;
  roles: PlatformRole[];
  enabled: boolean;
};

const bottomItemWidth = 80;
const bottomItemGap = 8;
const bottomHorizontalPadding = 24;

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: IconLayoutDashboard,
    roles: [
      "order_registrar",
      "cashier",
      "release_verifier",
      "branch_manager",
      "admin",
      "super_admin",
    ],
    enabled: true,
  },
  {
    href: "/reports",
    label: "Reports",
    shortLabel: "Reports",
    icon: IconReportAnalytics,
    roles: [
      "cashier",
      "branch_manager",
      "admin",
      "super_admin",
    ],
    enabled: true,
  },
  {
    href: "/profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: IconUserCircle,
    roles: [
      "order_registrar",
      "cashier",
      "release_verifier",
      "branch_manager",
      "admin",
      "super_admin",
    ],
    enabled: true,
  },
  {
    href: "/orders",
    label: "Order registration",
    shortLabel: "Orders",
    icon: IconClipboardList,
    roles: ["order_registrar", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/customers",
    label: "Customers",
    shortLabel: "Customers",
    icon: IconUsers,
    roles: ["order_registrar", "cashier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/cashier",
    label: "Payments",
    shortLabel: "Pay",
    icon: IconCash,
    roles: ["cashier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/release",
    label: "Release verification",
    shortLabel: "Release",
    icon: IconShieldCheck,
    roles: ["release_verifier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/inventory",
    label: "Inventory",
    shortLabel: "Stock",
    icon: IconPackage,
    roles: ["order_registrar", "cashier", "release_verifier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/reversals",
    label: "Reversals",
    shortLabel: "Reverse",
    icon: IconReceiptRefund,
    roles: ["order_registrar", "cashier", "release_verifier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/branches",
    label: "Branches",
    shortLabel: "Branches",
    icon: IconBuildingStore,
    roles: ["admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/catalog/products",
    label: "Product catalog",
    shortLabel: "Catalog",
    icon: IconDiamond,
    roles: ["admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/access",
    label: "Access management",
    shortLabel: "Access",
    icon: IconLockAccess,
    roles: ["admin", "super_admin"],
    enabled: true,
  },
];

export function AppNavigation({
  role,
  placement = "side",
}: {
  role: PlatformRole;
  placement?: "side" | "bottom";
}) {
  const visibleItems = navItems.filter((item) => item.roles.includes(role));
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  }

  if (placement === "bottom") {
    return (
      <BottomNavigation items={visibleItems} isActive={isActive} pathname={pathname} />
    );
  }

  return (
    <nav className="space-y-1.5">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
          item.enabled ? (
            <Link
              className={cn(
                "fluid-hover glass-edge flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 hover:border-sidebar-border hover:bg-white/[0.14] hover:text-sidebar-accent-foreground",
                active && "border-sidebar-border bg-white/[0.2] text-sidebar-accent-foreground shadow-sm",
              )}
              href={item.href}
              key={item.label}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-sidebar-foreground/45",
                  active && "text-sidebar-primary",
                )}
              />
              <span>{item.label}</span>
            </Link>
          ) : (
            <div
              aria-disabled="true"
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/45"
              key={item.label}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="text-xs">Unavailable</span>
            </div>
          )
        );
      })}
    </nav>
  );
}

function BottomNavigation({
  isActive,
  items,
  pathname,
}: {
  isActive: (href: string) => boolean;
  items: NavItem[];
  pathname: string;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    function updateWidth() {
      setAvailableWidth(nav?.clientWidth ?? 0);
    }

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(nav);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        moreRef.current &&
        event.target instanceof Node &&
        !moreRef.current.contains(event.target)
      ) {
        setMoreOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const { overflowItems, visibleBottomItems } = useMemo(() => {
    if (availableWidth <= 0) {
      return { visibleBottomItems: items.slice(0, 3), overflowItems: items.slice(3) };
    }

    const innerWidth = Math.max(0, availableWidth - bottomHorizontalPadding);
    const allItemsWidth =
      items.length * bottomItemWidth + Math.max(0, items.length - 1) * bottomItemGap;

    if (allItemsWidth <= innerWidth) {
      return { visibleBottomItems: items, overflowItems: [] };
    }

    const visibleCount = Math.max(
      1,
      Math.floor((innerWidth - bottomItemWidth) / (bottomItemWidth + bottomItemGap)),
    );

    return {
      visibleBottomItems: items.slice(0, visibleCount),
      overflowItems: items.slice(visibleCount),
    };
  }, [availableWidth, items]);

  const overflowActive = overflowItems.some((item) => isActive(item.href));

  return (
    <Fragment>
      <nav
        aria-label="Primary navigation"
        className="flex justify-center gap-2 overflow-visible px-3 py-2"
        ref={navRef}
      >
        {visibleBottomItems.map((item) => (
          <BottomNavItem isActive={isActive(item.href)} item={item} key={item.label} />
        ))}

        {overflowItems.length > 0 ? (
          <button
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={cn(
              "fluid-hover glass-edge flex min-w-20 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-2 py-2 text-center text-[0.68rem] font-semibold leading-tight text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
              (moreOpen || overflowActive) && "border-border bg-card text-foreground shadow-sm",
            )}
            onClick={() => setMoreOpen((open) => !open)}
            type="button"
          >
            <IconDots aria-hidden="true" className="size-5 shrink-0" />
            <span className="w-full truncate">More</span>
          </button>
        ) : null}
      </nav>

      {moreOpen && overflowItems.length > 0 ? (
        <div
          aria-modal="true"
          className="bottom-more-dialog fixed inset-0 z-[70] flex flex-col justify-end px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6"
          role="dialog"
        >
          <button
            aria-label="Close navigation menu"
            className="absolute inset-0 cursor-default bg-foreground/15 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
            type="button"
          />
          <div
            className="app-surface glass-edge bottom-more-sheet relative z-10 mx-auto mt-auto max-h-[min(62vh,26rem)] w-full max-w-sm overflow-y-auto rounded-2xl border p-2 text-sm shadow-2xl"
            ref={moreRef}
          >
            <div className="px-3 pb-2 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                More
              </p>
            </div>
            {overflowItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return item.enabled ? (
                <Link
                  className={cn(
                    "fluid-hover flex items-center gap-3 rounded-lg px-3 py-2 text-foreground hover:bg-secondary",
                    active && "bg-primary text-primary-foreground",
                  )}
                  href={item.href}
                  key={item.label}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground opacity-55"
                  key={item.label}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Fragment>
  );
}

function BottomNavItem({ isActive, item }: { isActive: boolean; item: NavItem }) {
  const Icon = item.icon;

  return item.enabled ? (
    <Link
      className={cn(
        "fluid-hover flex min-w-20 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-2 py-2 text-center text-[0.68rem] font-semibold leading-tight text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
        isActive && "glass-edge border-border bg-card text-foreground shadow-sm",
      )}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="w-full truncate">{item.shortLabel}</span>
    </Link>
  ) : (
    <div
      aria-disabled="true"
      className="flex min-w-20 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-2 py-2 text-center text-[0.68rem] font-semibold leading-tight text-muted-foreground opacity-55"
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="w-full truncate">{item.shortLabel}</span>
    </div>
  );
}
