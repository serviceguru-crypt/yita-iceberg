const workflowSteps = [
  {
    title: "Order Registered",
    body: "Staff records the customer request and reserves available stock for a controlled sale path.",
  },
  {
    title: "Payment Confirmed",
    body: "Cashier verifies settlement details before the order can move toward release.",
  },
  {
    title: "Release Verified",
    body: "A release verifier validates payment status, order identity, and approval before handover.",
  },
  {
    title: "Sale Completed",
    body: "Inventory, movements, ledgers, and reporting update through the secure workflow.",
  },
];

export function WorkflowSection() {
  return (
    <section className="bg-[#f8f5ef] px-4 py-16 text-[#071426] sm:px-6 md:py-20 lg:px-8" id="workflow">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#8f7437]">
            Trading workflow
          </p>
          <h2 className="mt-4 font-display text-4xl leading-tight text-balance sm:text-5xl">
            A luxury transaction path with operational discipline.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <article
              className="group rounded-3xl border border-[#071426]/10 bg-white p-6 shadow-[0_24px_70px_rgba(7,20,38,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(7,20,38,0.12)]"
              key={step.title}
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="font-display text-5xl text-[#c8a45d]">0{index + 1}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-[#c8a45d]/60 to-transparent" />
              </div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="mt-4 text-sm leading-6 text-[#1d2430]/72">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
