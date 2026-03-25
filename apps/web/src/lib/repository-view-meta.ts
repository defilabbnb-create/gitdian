import {
  RepositoryDisplayMode,
  RepositoryRecommendedView,
} from '@/lib/types/repository';

type RepositoryViewMeta = {
  label: string;
  helper: string;
};

type RepositoryDisplayModeMeta = {
  label: string;
  helper: string;
};

export const repositoryViewMeta: Record<
  RepositoryRecommendedView,
  RepositoryViewMeta
> = {
  moneyFirst: {
    label: '挣钱优先',
    helper: '先看更容易做成生意的项目，再看可借鉴和该跳过的项目。',
  },
  bestIdeas: {
    label: '最佳工具机会',
    helper: '默认先看结论层里最值得继续判断、跟进和产品化的项目。',
  },
  all: {
    label: '全部项目',
    helper: '查看当前筛选条件下的完整机会池。',
  },
  highOpportunity: {
    label: '高机会项目',
    helper: '优先看已经显出明确商业机会信号的项目。',
  },
  highOpportunityUnfavorited: {
    label: '高机会待收藏',
    helper: '已经值得继续跟进，但还没收进收藏池的项目。',
  },
  extractedIdea: {
    label: '已提取点子',
    helper: '已经形成产品化方向，适合继续比较和筛选。',
  },
  ideaExtractionPending: {
    label: '待补点子项目',
    helper: '核心评分已有，但还缺一句能落地的产品点子。',
  },
  pendingAnalysis: {
    label: '待分析项目',
    helper: '还缺核心判断，先补分析再决定值不值得继续看。',
  },
  favoritedPendingAnalysis: {
    label: '已收藏待补分析',
    helper: '已经进入跟进池，但结论层还没补齐。',
  },
  newRadar: {
    label: '新项目雷达',
    helper: '最近 30 天新创建项目，适合追最新工具和产品动向。',
  },
  backfilledPromising: {
    label: '365 天工具机会雷达',
    helper: '过去一年回溯后筛出来的工具、AI、数据和基础设施机会池。',
  },
};

export const repositoryDisplayModeMeta: Record<
  RepositoryDisplayMode,
  RepositoryDisplayModeMeta
> = {
  insight: {
    label: '结论模式',
    helper: '优先看一句话、判断、分类和建议动作。',
  },
  detail: {
    label: '详细模式',
    helper: '补看 stars、语言、分数和更多技术线索。',
  },
};

export function getRepositoryViewMeta(view: RepositoryRecommendedView) {
  return repositoryViewMeta[view];
}

export function getRepositoryDisplayModeMeta(
  displayMode: RepositoryDisplayMode,
) {
  return repositoryDisplayModeMeta[displayMode];
}
