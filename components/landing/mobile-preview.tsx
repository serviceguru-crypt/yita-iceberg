export function MobilePreview() {
  return (
    <section className="bg-[#071426] px-4 py-16 text-white sm:px-6 md:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[0.9fr_1.1fr]">
        <div className="order-2 mx-auto w-full max-w-xs rounded-[2.2rem] border border-white/15 bg-[#020812] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.34)] md:order-1">
          <div className="rounded-[1.75rem] bg-[#f8f5ef] p-4 text-[#071426]">
            <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-[#071426]/20" />
            <p className="text-xs uppercase tracking-[0.18em] text-[#8f7437]">Preview Only</p>
            <h3 className="mt-2 text-xl font-semibold">Order lookup</h3>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm font-medium">Demo Order</p>
                <p className="mt-1 text-xs text-[#1d2430]/60">Payment status: confirmed</p>
              </div>
              <div className="rounded-2xl bg-[#071426] p-4 text-white">
                <p className="text-sm font-medium">Release verification</p>
                <p className="mt-1 text-xs text-[#dceaf7]/70">QR check ready</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#e8edf2] p-2 text-center text-[0.65rem] text-[#071426]/70">
              <span>Orders</span>
              <span>Pay</span>
              <span>Release</span>
            </div>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#e6d3a3]">
            Mobile-first access
          </p>
          <h2 className="mt-4 font-display text-4xl leading-tight text-balance sm:text-5xl">
            Fast enough for the sales floor, controlled enough for governance.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#dceaf7]/72">
            Mobile screens prioritize order lookup, payment state, and release verification with native-feeling spacing and thumb-friendly actions.
          </p>
        </div>
      </div>
    </section>
  );
}
