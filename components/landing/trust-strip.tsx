const indicators = [
  "Branch-controlled inventory",
  "Verified payment flow",
  "Secure release approval",
  "Audit-ready transactions",
  "Real-time reporting",
];

export function TrustStrip() {
  return (
    <section className="bg-[#071426] px-4 pb-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {indicators.map((indicator) => (
          <div
            className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-4 text-sm text-[#dceaf7] shadow-[0_20px_44px_rgba(0,0,0,0.12)]"
            key={indicator}
          >
            <span className="mb-3 block h-px w-10 bg-[#c8a45d]" />
            {indicator}
          </div>
        ))}
      </div>
    </section>
  );
}
