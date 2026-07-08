import Link from "next/link";

import type { PlatformRole } from "@/lib/domain/roles";

type NavItem = {
  href: string;
  label: string;
  roles: PlatformRole[];
  enabled: boolean;
};

const navItems: NavItem[] = [
  {
    href: "/profile",
    label: "Profile",
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
    roles: ["order_registrar", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/customers",
    label: "Customers",
    roles: ["order_registrar", "cashier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/cashier",
    label: "Payments",
    roles: ["cashier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/release",
    label: "Release verification",
    roles: ["release_verifier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/inventory",
    label: "Inventory",
    roles: ["order_registrar", "cashier", "release_verifier", "branch_manager", "admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/catalog/products",
    label: "Product catalog",
    roles: ["admin", "super_admin"],
    enabled: true,
  },
  {
    href: "/profile",
    label: "Access management",
    roles: ["admin", "super_admin"],
    enabled: false,
  },
];

export function AppNavigation({ role }: { role: PlatformRole }) {
  return (
    <nav className="space-y-1">
      {navItems
        .filter((item) => item.roles.includes(role))
        .map((item) =>
          item.enabled ? (
            <Link
              className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ) : (
            <div
              aria-disabled="true"
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground"
              key={item.label}
            >
              <span>{item.label}</span>
              <span className="text-xs">Unavailable</span>
            </div>
          ),
        )}
    </nav>
  );
}
