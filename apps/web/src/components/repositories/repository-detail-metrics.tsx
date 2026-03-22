import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailMetricsProps = {
  repository: RepositoryDetail;
};

function formatScore(value?: number | null) {
  if (typeof value !== 'number') {
    return '--';
  }

  return Math.round(value);
}

const metrics = [
  {
    key: 'ideaFitScore',
    label: '创业机会分',
    helper: '值不值得作为互联网工具方向继续投入',
  },
  {
    key: 'completenessScore',
    label: '完整性分',
    helper: '文档、结构、可运行性和工程化成熟度',
  },
  {
    key: 'toolLikeScore',
    label: '工具倾向',
    helper: '这个仓库是否像一个可产品化工具而非练习项目',
  },
  {
    key: 'finalScore',
    label: '最终分',
    helper: '后续综合排序分，当前阶段可能尚未完整回填',
  },
] as const;

export function RepositoryDetailMetrics({
  repository,
}: RepositoryDetailMetricsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.key}
          className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {metric.label}
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
            {formatScore(repository[metric.key])}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{metric.helper}</p>
        </div>
      ))}
    </section>
  );
}
