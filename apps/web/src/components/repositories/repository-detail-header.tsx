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
  const categorySummary =
    decisionViewModel.behaviorContext.categoryLabel ??
    repository.analysis?.insightJson?.categoryDisplay?.label ??
    repository.finalDecision?.decisionSummary?.categoryLabelZh ??
    repository.finalDecision?.categoryLabelZh ??
    '待分类';
  const monetizationSummary =
    decisionViewModel.displayState === 'trusted'
      ? decisionViewModel.display.monetizationLabel
      : softenHeldBackNarrative(
          decisionViewModel.display.monetizationLabel,
          '收费路径还在校准，先补关键分析后再判断是否真的能收钱。',
        );

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
          <p className="max-w-4xl text-lg leading-8 text-slate-100">
            {decisionViewModel.display.headline}
          </p>
          <p className="text-sm text-slate-300">
            优先把谁会用、为什么值得看、怎么收费和下一步动作放到台面上，避免详情页只剩一堆保守提示。
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

        <div className="grid gap-3 xl:grid-cols-4">
          <HeroNarrative
            label="谁会用"
            value={decisionViewModel.display.targetUsersLabel}
          />
          <HeroNarrative
            label="属于什么"
            value={categorySummary}
          />
          <HeroNarrative
            label="怎么收费"
            value={monetizationSummary}
          />
          <HeroNarrative
            label="下一步"
            value={decisionViewModel.detail.primaryActionDescription}
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

function HeroNarrative({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/8 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
        {label}
      </p>
      <p className="mt-3 text-sm leading-7 text-slate-100">{value}</p>
    </div>
  );
}

function softenHeldBackNarrative(value: string, fallback: string) {
  const normalized = value.trim();

  if (!normalized) {
    return fallback;
  }

  if (
    /收费路径还在校准|收费路径先按未确认处理|补关键分析后再判断|待验证线索/.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return `${normalized} 当前先按待验证线索看，不直接当作已验证收入。`;
}
