import {
  buildJobLogListSearchParams,
  JobLogItem,
  JobLogQueryState,
} from '@/lib/types/repository';

export const LONG_PENDING_MINUTES = 20;
export const LONG_RUNNING_MINUTES = 25;

export type JobAttentionState =
  | 'FAILED'
  | 'STALLED'
  | 'LONG_PENDING'
  | 'RUNNING'
  | 'PENDING';

export type JobPriorityGroup = {
  key: string;
  state: JobAttentionState;
  jobName: string;
  displayName: string;
  count: number;
  oldestAgeMinutes: number;
  oldestAgeLabel: string;
  impactLabel: string;
  affectsPrimaryFlow: boolean;
  recommendation: string;
  summary: string;
  detailHref: string;
  primaryJobId: string;
  jobs: JobLogItem[];
};

export type JobsPriorityViewModel = {
  anomalyGroups: JobPriorityGroup[];
  attentionGroups: JobPriorityGroup[];
  hiddenGroupCount: number;
  hiddenJobCount: number;
  visibleGroupCount: number;
  summaryTitle: string;
  summaryDescription: string;
};

const ANOMALY_STATES: JobAttentionState[] = [
  'FAILED',
  'STALLED',
  'LONG_PENDING',
];

export function buildJobsPriorityViewModel(
  items: JobLogItem[],
  query: JobLogQueryState,
  now = Date.now(),
): JobsPriorityViewModel {
  const grouped = new Map<string, JobLogItem[]>();

  for (const job of items) {
    const state = deriveJobAttentionState(job, now);

    if (!state) {
      continue;
    }

    const key = `${job.jobName}::${state}`;
    const bucket = grouped.get(key);

    if (bucket) {
      bucket.push(job);
      continue;
    }

    grouped.set(key, [job]);
  }

  const groups = [...grouped.entries()]
    .map(([key, jobs]) => buildJobPriorityGroup(key, jobs, query, now))
    .sort((left, right) => compareJobPriorityGroups(left, right));

  const anomalyGroups = groups.filter((group) =>
    ANOMALY_STATES.includes(group.state),
  );
  const attentionGroups = groups.filter((group) => !anomalyGroups.includes(group));
  const visibleAttentionGroups = attentionGroups
    .filter((group) => group.affectsPrimaryFlow || group.state === 'RUNNING')
    .slice(0, 6);
  const hiddenGroups = attentionGroups.filter(
    (group) => !visibleAttentionGroups.includes(group),
  );

  return {
    anomalyGroups: anomalyGroups.slice(0, 6),
    attentionGroups: visibleAttentionGroups,
    hiddenGroupCount: hiddenGroups.length,
    hiddenJobCount: hiddenGroups.reduce((sum, group) => sum + group.count, 0),
    visibleGroupCount: anomalyGroups.slice(0, 6).length + visibleAttentionGroups.length,
    summaryTitle: anomalyGroups.length
      ? '先处理失败、卡住和排队过久的任务。'
      : '当前无异常，首屏只保留值得盯的任务分组。',
    summaryDescription: anomalyGroups.length
      ? `${anomalyGroups.length} 组任务已经进入异常或超时状态，先从影响主链路的那几组开始看。`
      : attentionGroups.length
        ? '现在没有明显异常，剩下的是运行中或排队中的任务，先看影响主链路的那几组。'
        : '当前没有需要立刻处理的任务，完整任务流主要用于回看上下文。 ',
  };
}

export function deriveJobAttentionState(
  job: JobLogItem,
  now: number,
): JobAttentionState | null {
  if (job.jobStatus === 'FAILED') {
    return 'FAILED';
  }

  if (job.jobStatus === 'RUNNING') {
    return getAgeMinutes(job.startedAt ?? job.createdAt, now) >=
      LONG_RUNNING_MINUTES
      ? 'STALLED'
      : 'RUNNING';
  }

  if (job.jobStatus === 'PENDING') {
    return getAgeMinutes(job.createdAt, now) >= LONG_PENDING_MINUTES
      ? 'LONG_PENDING'
      : 'PENDING';
  }

  return null;
}

export function buildJobDetailHref(query: JobLogQueryState, jobId: string) {
  const search = buildJobLogListSearchParams({
    ...query,
    focusJobId: jobId,
    page: 1,
  });

  return search ? `/jobs?${search}#job-${jobId}` : `/jobs?focusJobId=${jobId}#job-${jobId}`;
}

function buildJobPriorityGroup(
  key: string,
  jobs: JobLogItem[],
  query: JobLogQueryState,
  now: number,
): JobPriorityGroup {
  const representative = [...jobs].sort((left, right) =>
    compareGroupJobs(left, right, now),
  )[0];
  const state = deriveJobAttentionState(representative, now) as JobAttentionState;
  const displayName = getJobTypeLabel(representative.jobName);
  const oldestAgeMinutes = jobs.reduce(
    (maxAge, job) => Math.max(maxAge, getRelevantAgeMinutes(job, state, now)),
    0,
  );
  const affectsPrimaryFlow = jobs.some((job) => isPrimaryFlowJob(job));

  return {
    key,
    state,
    jobName: representative.jobName,
    displayName,
    count: jobs.length,
    oldestAgeMinutes,
    oldestAgeLabel: getOldestAgeLabel(state, oldestAgeMinutes),
    impactLabel: affectsPrimaryFlow ? '影响主链路' : '局部任务',
    affectsPrimaryFlow,
    recommendation: getJobRecommendation(state, affectsPrimaryFlow),
    summary: buildGroupSummary({
      displayName,
      state,
      count: jobs.length,
      oldestAgeMinutes,
      affectsPrimaryFlow,
    }),
    detailHref: buildJobDetailHref(query, representative.id),
    primaryJobId: representative.id,
    jobs,
  };
}

function compareJobPriorityGroups(left: JobPriorityGroup, right: JobPriorityGroup) {
  const severityDelta =
    getAttentionStateWeight(right.state) - getAttentionStateWeight(left.state);

  if (severityDelta !== 0) {
    return severityDelta;
  }

  const impactDelta =
    Number(right.affectsPrimaryFlow) - Number(left.affectsPrimaryFlow);

  if (impactDelta !== 0) {
    return impactDelta;
  }

  if (right.oldestAgeMinutes !== left.oldestAgeMinutes) {
    return right.oldestAgeMinutes - left.oldestAgeMinutes;
  }

  if (right.count !== left.count) {
    return right.count - left.count;
  }

  return left.displayName.localeCompare(right.displayName, 'zh-CN');
}

function compareGroupJobs(left: JobLogItem, right: JobLogItem, now: number) {
  const primaryFlowDelta = Number(isPrimaryFlowJob(right)) - Number(isPrimaryFlowJob(left));

  if (primaryFlowDelta !== 0) {
    return primaryFlowDelta;
  }

  const leftState = deriveJobAttentionState(left, now) as JobAttentionState;
  const rightState = deriveJobAttentionState(right, now) as JobAttentionState;
  const ageDelta =
    getRelevantAgeMinutes(right, rightState, now) -
    getRelevantAgeMinutes(left, leftState, now);

  if (ageDelta !== 0) {
    return ageDelta;
  }

  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function getAttentionStateWeight(state: JobAttentionState) {
  switch (state) {
    case 'FAILED':
      return 5;
    case 'STALLED':
      return 4;
    case 'LONG_PENDING':
      return 3;
    case 'RUNNING':
      return 2;
    case 'PENDING':
      return 1;
    default:
      return 0;
  }
}

function buildGroupSummary({
  displayName,
  state,
  count,
  oldestAgeMinutes,
  affectsPrimaryFlow,
}: {
  displayName: string;
  state: JobAttentionState;
  count: number;
  oldestAgeMinutes: number;
  affectsPrimaryFlow: boolean;
}) {
  const ageLabel = formatMinutes(oldestAgeMinutes);
  const impactLabel = affectsPrimaryFlow ? '会直接影响主链路' : '主要影响局部任务';

  switch (state) {
    case 'FAILED':
      return `${displayName} 这一组有 ${count} 个失败任务，最早一条失败于 ${ageLabel} 前，${impactLabel}。`;
    case 'STALLED':
      return `${displayName} 这一组有 ${count} 个运行过久的任务，最老一条已运行 ${ageLabel}，${impactLabel}。`;
    case 'LONG_PENDING':
      return `${displayName} 这一组有 ${count} 个排队过久的任务，最老一条已等待 ${ageLabel}，${impactLabel}。`;
    case 'RUNNING':
      return `${displayName} 这一组当前有 ${count} 个运行中任务，最老一条已运行 ${ageLabel}。`;
    case 'PENDING':
      return `${displayName} 这一组当前有 ${count} 个排队任务，最老一条已等待 ${ageLabel}。`;
    default:
      return `${displayName} 当前有 ${count} 个任务。`;
  }
}

function getJobRecommendation(
  state: JobAttentionState,
  affectsPrimaryFlow: boolean,
) {
  switch (state) {
    case 'FAILED':
      return '先看失败详情';
    case 'STALLED':
      return '先看执行信息';
    case 'LONG_PENDING':
      return affectsPrimaryFlow ? '先看排队详情' : '确认是否还需要继续排队';
    case 'RUNNING':
      return affectsPrimaryFlow ? '查看任务详情' : '继续观察';
    case 'PENDING':
      return affectsPrimaryFlow ? '查看任务详情' : '等待调度';
    default:
      return '查看任务详情';
  }
}

function getOldestAgeLabel(state: JobAttentionState, oldestAgeMinutes: number) {
  const ageLabel = formatMinutes(oldestAgeMinutes);

  switch (state) {
    case 'FAILED':
      return `最早失败于 ${ageLabel} 前`;
    case 'STALLED':
      return `最老一条已运行 ${ageLabel}`;
    case 'LONG_PENDING':
    case 'PENDING':
      return `最老一条已等待 ${ageLabel}`;
    case 'RUNNING':
      return `最老一条已运行 ${ageLabel}`;
    default:
      return ageLabel;
  }
}

function getRelevantAgeMinutes(
  job: JobLogItem,
  state: JobAttentionState,
  now: number,
) {
  if (state === 'FAILED') {
    return getAgeMinutes(job.finishedAt ?? job.updatedAt ?? job.createdAt, now);
  }

  if (state === 'RUNNING' || state === 'STALLED') {
    return getAgeMinutes(job.startedAt ?? job.createdAt, now);
  }

  return getAgeMinutes(job.createdAt, now);
}

function getAgeMinutes(value: string | null | undefined, now: number) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - time) / (60 * 1000)));
}

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;

  if (remainMinutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${remainMinutes} 分钟`;
}

function getJobTypeLabel(jobName: string) {
  const normalized = jobName.trim().toLowerCase();

  if (normalized.includes('analysis.run_single')) {
    return '单仓分析执行';
  }

  if (normalized.includes('analysis.idea_snapshot')) {
    return 'Snapshot 粗筛';
  }

  if (normalized.includes('analysis.completeness')) {
    return '完整性判断';
  }

  if (normalized.includes('analysis.idea_fit')) {
    return '创业匹配判断';
  }

  if (normalized.includes('analysis.idea_extract')) {
    return '深度机会提取';
  }

  if (normalized.includes('analysis.run_batch')) {
    return '批量分析调度';
  }

  if (normalized.includes('github.created-backfill')) {
    return 'GitHub 历史回填';
  }

  if (normalized.includes('github.radar')) {
    return 'Radar 调度';
  }

  if (normalized.includes('github.fetch')) {
    return 'GitHub 抓取';
  }

  if (normalized.includes('claude')) {
    return 'Claude 复核';
  }

  return jobName;
}

function isPrimaryFlowJob(job: JobLogItem) {
  const normalized = job.jobName.toLowerCase();
  const primaryFlowKeywords = [
    'analysis.run_single',
    'analysis.run_batch',
    'analysis.idea_',
    'analysis.completeness',
    'analysis.idea_fit',
    'analysis.idea_extract',
    'analysis.idea_snapshot',
    'deep',
    'claude',
    'backfill',
    'radar',
    'github.fetch',
  ];

  if (!job.parentJobId) {
    return true;
  }

  return primaryFlowKeywords.some((keyword) => normalized.includes(keyword));
}
