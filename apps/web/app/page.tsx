const navigationItems = ["Campaigns", "Leads", "Mailboxes", "Activity"];

const metrics = [
  { label: "Queued leads", value: "0", detail: "Ready for enrichment" },
  { label: "Active campaigns", value: "0", detail: "No sends scheduled" },
  { label: "Mailbox health", value: "3", detail: "Accounts connected for setup" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Warmailer</p>
            <h1 className="text-2xl font-semibold">Outbound operations</h1>
          </div>
          <nav aria-label="Primary navigation" className="flex gap-2">
            {navigationItems.map((item) => (
              <span key={item} className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                {item}
              </span>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        <div className="rounded border border-slate-200 bg-white p-6">
          <p className="text-sm font-medium text-slate-500">Workspace foundation</p>
          <h2 className="mt-2 text-xl font-semibold">Campaign, lead, and mailbox control plane</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            The app shell starts with operational surfaces only: campaign preparation, lead review, mailbox readiness,
            and event activity. Workspace identity is resolved server-side before any future API action.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
              <p className="mt-2 text-sm text-slate-600">{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
