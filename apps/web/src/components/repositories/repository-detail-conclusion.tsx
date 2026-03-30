import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';

type RepositoryDetailConclusionProps = {
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryDetailConclusion({
  decisionViewModel,
}: RepositoryDetailConclusionProps) {
  return (
    <section id="decision" className="rounded-[36px] border border-slate-200 bg-white/95 p-7 shadow-sm backdrop-blur">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            主判断
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {decisionViewModel.display.headline}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            当前先把结论和下一步动作收口到一屏里，下面的模块继续展开看细节。
          </p>
        </div>

        <div className="divide-y divide-slate-200 rounded-[28px] border border-slate-200 bg-slate-50">
          <DecisionRow
            label="现在结论"
            value={
              decisionViewModel.detail.baseJudgementNotice
                ? `${decisionViewModel.detail.baseJudgementNotice}${decisionViewModel.display.finalDecisionLabel}`
                : decisionViewModel.display.finalDecisionLabel
            }
          />
          <DecisionRow
            label="为什么这样判断"
            value={decisionViewModel.display.reason}
          />
          <DecisionRow
            label="缺什么证据"
            value={decisionViewModel.detail.missingEvidenceLabel}
          />
          <DecisionRow
            label="下一步该做什么"
            value={decisionViewModel.detail.primaryActionDescription}
          />
        </div>
      </div>
    </section>
  );
}

function DecisionRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2 px-5 py-5 md:grid-cols-[180px_1fr] md:gap-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="text-sm leading-7 text-slate-700">{value}</p>
    </div>
  );
}
