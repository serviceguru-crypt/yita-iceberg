const tabletRows = [
  ["Demo Order", "Awaiting payment"],
  ["Demo Stock", "Reserved"],
  ["Preview Only", "Release locked"],
];

export function TabletPreview() {
  return (
    <section className="bg-[#eef4f9] px-4 py-16 text-[#071426] sm:px-6 md:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#8f7437]">
            Tablet control surface
          </p>
          <h2 className="mt-4 font-display text-4xl leading-tight text-balance sm:text-5xl">
            A dedicated-feeling tablet experience for branch teams.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#1d2430]/72">
            Large touch targets, app-like panels, and clear status controls keep the counter workflow moving without hiding approval checks.
          </p>
        </div>
        <div className="rounded-[2rem] border border-[#071426]/15 bg-[#071426] p-3 shadow-[0_32px_90px_rgba(7,20,38,0.22)]">
          <div className="rounded-[1.45rem] bg-[#f8f5ef] p-5">
            <div className="flex items-center justify-between gap-4 border-b border-[#071426]/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#8f7437]">Sample Branch</p>
                <p className="mt-1 text-lg font-semibold">Control Dashboard</p>
              </div>
              <span className="rounded-full bg-[#071426] px-3 py-1 text-xs text-white">Preview Only</span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_0.75fr]">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold">Workflow queue</p>
                <div className="mt-4 space-y-3">
                  {tabletRows.map(([name, status]) => (
                    <div className="flex items-center justify-between rounded-xl border border-[#071426]/8 p-3" key={name}>
                      <span className="text-sm">{name}</span>
                      <span className="rounded-full bg-[#dceaf7] px-3 py-1 text-xs text-[#071426]">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-[#071426] p-4 text-white">
                <p className="text-sm font-semibold">Stock posture</p>
                <div className="mt-5 space-y-3">
                  {["Branch locked", "Payment proof private", "Release approval pending"].map((item) => (
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-xs text-[#dceaf7]" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
