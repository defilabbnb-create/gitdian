export default function Loading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_100%)] px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-40 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
        <div className="h-52 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
        <div className="h-52 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
      </div>
    </main>
  );
}
