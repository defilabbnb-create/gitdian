export default function JobsLoading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[36px] border border-slate-200 bg-white/80 px-8 py-10 shadow-sm">
          <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-5 h-12 w-full max-w-3xl animate-pulse rounded-3xl bg-slate-200" />
          <div className="mt-4 h-24 animate-pulse rounded-3xl bg-slate-100" />
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white/80 p-8 shadow-sm">
          <div className="h-40 animate-pulse rounded-3xl bg-slate-100" />
        </section>
      </div>
    </main>
  );
}
