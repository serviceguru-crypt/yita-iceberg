import {
  IconBuildingStore,
  IconChartBar,
  IconCreditCard,
  IconKey,
  IconRotateClockwise,
  IconShieldCheck,
} from "@tabler/icons-react";

const features = [
  {
    title: "Jewelry inventory control",
    body: "Branch stock, reservations, counts, and protected valuation fields stay separated.",
    icon: IconBuildingStore,
  },
  {
    title: "Payment verification",
    body: "Cash, transfer, POS, split, and credit flows are validated before release.",
    icon: IconCreditCard,
  },
  {
    title: "Release authorization",
    body: "Orders move only after payment and handover checks have passed.",
    icon: IconShieldCheck,
  },
  {
    title: "Returns and reversals",
    body: "Completed sales remain auditable through controlled correction records.",
    icon: IconRotateClockwise,
  },
  {
    title: "Branch reporting",
    body: "Managers and administrators can review activity with branch-aware visibility.",
    icon: IconChartBar,
  },
  {
    title: "Staff role permissions",
    body: "Every user sees only the work surface needed for their operational role.",
    icon: IconKey,
  },
];

export function FeaturePillars() {
  return (
    <section className="bg-[#071426] px-4 py-16 text-white sm:px-6 md:py-20 lg:px-8" id="platform">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#e6d3a3]">
              Platform pillars
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-balance sm:text-5xl">
              Built for teams that trade precious inventory under pressure.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[#dceaf7]/70">
            Each capability is designed to protect stock, prove decisions, and keep branch work fast.
          </p>
        </div>
        <div className="mt-10 grid auto-cols-[82%] grid-flow-col gap-4 overflow-x-auto pb-4 md:grid-flow-row md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
          {features.map((feature) => (
            <article
              className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)] transition hover:-translate-y-1 hover:border-[#c8a45d]/45"
              key={feature.title}
            >
              <feature.icon aria-hidden="true" className="size-7 text-[#c8a45d]" stroke={1.5} />
              <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#dceaf7]/72">{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
