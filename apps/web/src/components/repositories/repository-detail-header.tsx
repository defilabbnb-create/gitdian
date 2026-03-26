import {
  getMoneyPriorityTone,
} from '@/lib/repository-decision';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
import {
  RepositoryDetail,
} from '@/lib/types/repository';

type RepositoryDetailHeaderProps = {
  repository: RepositoryDetail;
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryDetailHeader({
  repository,
  decisionViewModel,
}: RepositoryDetailHeaderProps) {
  return (
    <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(140deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.97)_55%,_rgba(30,64,175,0.86)_100%)] px-8 py-8 text-white shadow-xl shadow-slate-900/10">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            仓库详情
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white">
            {repository.name}
          </h1>
          <p className="text-sm text-slate-300">
            详情页只保留一个主判断、一个主动作，其他证据按需展开。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HeroMetric
            label="当前结论"
            value={decisionViewModel.display.finalDecisionLabel}
            tone="border-white/10 bg-white/10 text-white"
          />
          <HeroMetric
            label="当前优先级"
            value={decisionViewModel.display.priorityLabel}
            tone={getMoneyPriorityTone(decisionViewModel.priority.toneTier)}
          />
          <HeroMetric
            label="当前动作"
            value={decisionViewModel.detail.primaryActionLabel}
            tone="border-sky-300/30 bg-sky-500/10 text-sky-100"
          />
          <HeroMetric
            label="当前状态"
            value={decisionViewModel.detail.statusLabel}
            tone={
              decisionViewModel.displayState === 'trusted'
                ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
                : decisionViewModel.displayState === 'provisional'
                  ? 'border-amber-300/30 bg-amber-500/10 text-amber-100'
                  : 'border-rose-300/30 bg-rose-500/10 text-rose-100'
            }
          />
        </div>
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-[24px] border px-5 py-4 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
