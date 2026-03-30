import React from 'react';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';

type RepositoryDetailConclusionProps = {
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryDetailConclusion({
  decisionViewModel,
}: RepositoryDetailConclusionProps) {
  const rerunRecommendation = resolveRerunRecommendation(decisionViewModel);

  return (
    <section id="decision" className="rounded-[36px] border border-slate-200 bg-white/95 p-7 shadow-sm backdrop-blur">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            主判断
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先判断为什么会停、卡在哪里、要不要补跑。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这一块只保留一组判断行，避免和头部、行动区重复叙述同一段 headline / reason / next step。
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
            label="为什么会停"
            value={decisionViewModel.display.reason}
          />
          <DecisionRow
            label="当前卡点"
            value={decisionViewModel.detail.missingEvidenceLabel}
          />
          <DecisionRow
            label="要不要补跑"
            value={rerunRecommendation}
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

function resolveRerunRecommendation(
  decisionViewModel: RepositoryDecisionViewModel,
) {
  const actionHint = `${decisionViewModel.detail.primaryActionLabel}：${decisionViewModel.detail.primaryActionDescription}`;

  if (decisionViewModel.detail.primaryActionIntent === 'analyze') {
    return `${actionHint} 当前建议先补跑，再回到结论层确认是否继续投入。`;
  }

  if (decisionViewModel.detail.primaryActionIntent === 'review') {
    return `${actionHint} 当前先复核冲突和执行证据，再决定是否补跑。`;
  }

  return decisionViewModel.displayState === 'trusted'
    ? `${actionHint} 当前优先进入验证，不需要立刻补跑。`
    : `${actionHint} 先做主动作验证，遇到卡点再补跑。`;
}
