import type { ReactNode } from 'react';
import { AnalysisRunner } from '@/components/repositories/analysis-runner';
import { ExportRepositoryJsonButton } from '@/components/repositories/export-repository-json-button';
import { RepositoryDetailContentSummary } from '@/components/repositories/repository-detail-content-summary';
import { RepositoryDetailFavorite } from '@/components/repositories/repository-detail-favorite';
import { RepositoryDetailMetadata } from '@/components/repositories/repository-detail-metadata';
import { RepositoryDetailMetrics } from '@/components/repositories/repository-detail-metrics';
import { RepositoryManualInsightControls } from '@/components/repositories/repository-manual-insight-controls';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryAnalysisWorkbenchProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryAnalysisWorkbench({
  repository,
  decisionViewModel,
}: RepositoryAnalysisWorkbenchProps) {
  const behaviorContext = decisionViewModel.behaviorContext;
  const comparison = decisionViewModel.evidence.comparison;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <RepositoryEvidenceSection
        eyebrow="判断对比"
        title="只有当你怀疑当前结论不稳时，再看主分析和历史复核参考的差异。"
        summary="先看主分析结论、历史复核参考和冲突摘要。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <WorkbenchMetric label="主分析" value={comparison.localVerdict} />
          <WorkbenchMetric label="历史复核参考" value={comparison.claudeVerdict} />
        </div>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">主分析一句话：</span>
            {comparison.localOneLiner}
          </p>
          <p>
            <span className="font-semibold text-slate-900">历史复核一句话：</span>
            {comparison.claudeOneLiner}
          </p>
          <p>
            <span className="font-semibold text-slate-900">冲突原因：</span>
            {comparison.conflictSummary}
          </p>
        </div>
      </RepositoryEvidenceSection>

      <RepositoryEvidenceSection
        eyebrow="补跑判断"
        title="只有当当前结论缺关键证据时，再回到这一组补跑入口。"
        summary="这里放重新补跑、导出 JSON 和执行记录入口。"
      >
        <div className="flex flex-wrap items-center gap-3">
          <ExportRepositoryJsonButton repository={repository} />
        </div>
        <div className="mt-5">
          <AnalysisRunner
            repositoryId={repository.id}
            categoryLabel={behaviorContext.categoryLabel}
            projectType={behaviorContext.projectType}
            targetUsersLabel={behaviorContext.targetUsersLabel}
            useCaseLabel={behaviorContext.useCaseLabel}
            patternKeys={behaviorContext.patternKeys}
            hasRealUser={behaviorContext.hasRealUser}
            hasClearUseCase={behaviorContext.hasClearUseCase}
            isDirectlyMonetizable={behaviorContext.isDirectlyMonetizable}
          />
        </div>
      </RepositoryEvidenceSection>

      <RepositoryEvidenceSection
        eyebrow="校准判断"
        title="只有当你明确不同意系统结论时，再人工校准。"
        summary="这里用于人工覆盖 verdict / action，不参与主流程判断。"
      >
        <RepositoryManualInsightControls
          repositoryId={repository.id}
          manualOverride={repository.analysis?.manualOverride ?? null}
        />
      </RepositoryEvidenceSection>

      <RepositoryEvidenceSection
        eyebrow="分数面板"
        title="只有当你要拆解排序来源时，再看这些分数。"
        summary="这里放创业机会分、完整性分、工具倾向和最终分。"
      >
        <RepositoryDetailMetrics repository={repository} />
      </RepositoryEvidenceSection>

      <RepositoryEvidenceSection
        eyebrow="Metadata"
        title="只有当你要确认仓库基本事实时，再看元数据。"
        summary="这里放 owner、语言、时间线、topics 和快照。"
      >
        <RepositoryDetailMetadata repository={repository} />
      </RepositoryEvidenceSection>

      <RepositoryEvidenceSection
        eyebrow="README / 内容"
        title="只有当你要核对原始仓库证据时，再看 README 和目录摘要。"
        summary="这里放 README 预览、目录结构、工程化特征和近期提交。"
      >
        <div className="space-y-6">
          <RepositoryDetailFavorite repository={repository} />
          <RepositoryDetailContentSummary repository={repository} />
        </div>
      </RepositoryEvidenceSection>
    </div>
  );
}

function RepositoryEvidenceSection({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {summary}
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-600 transition group-open:rotate-180">
            展开
          </span>
        </div>
      </summary>

      <div className="mt-6 border-t border-slate-200 pt-6">{children}</div>
    </details>
  );
}

function WorkbenchMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}
