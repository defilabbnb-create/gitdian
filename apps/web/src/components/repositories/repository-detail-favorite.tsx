import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailFavoriteProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailFavorite({
  repository,
}: RepositoryDetailFavoriteProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Favorite
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        收藏信息
      </h2>

      {repository.favorite ? (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InfoCard title="优先级" value={repository.favorite.priority} />
          <InfoCard
            title="收藏时间"
            value={formatDate(repository.favorite.createdAt)}
          />
          <InfoCard
            title="更新时间"
            value={formatDate(repository.favorite.updatedAt)}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          当前还没有收藏记录。你可以直接在页面顶部点击收藏按钮，稍后再补 note 和 priority。
        </div>
      )}

      {repository.favorite?.note ? (
        <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            收藏备注
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-700">{repository.favorite.note}</p>
        </div>
      ) : null}
    </section>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <p className="mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
