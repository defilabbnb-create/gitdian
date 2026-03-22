export default function RepositoryDetailLoading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-72 animate-pulse rounded-[36px] bg-white/85 shadow-sm" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-36 animate-pulse rounded-[28px] bg-white/85 shadow-sm" />
          <div className="h-36 animate-pulse rounded-[28px] bg-white/85 shadow-sm" />
          <div className="h-36 animate-pulse rounded-[28px] bg-white/85 shadow-sm" />
          <div className="h-36 animate-pulse rounded-[28px] bg-white/85 shadow-sm" />
        </div>
        <div className="h-96 animate-pulse rounded-[32px] bg-white/85 shadow-sm" />
        <div className="h-96 animate-pulse rounded-[32px] bg-white/85 shadow-sm" />
      </div>
    </main>
  );
}
