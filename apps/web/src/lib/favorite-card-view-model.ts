import {
  buildRepositoryDecisionViewModel,
  type RepositoryDecisionViewModel,
} from '@/lib/repository-decision-view-model';
import {
  getExecutionStatusLabel,
  getFollowUpStageLabel,
  getNextFollowUpStage,
  type ActionLoopEntry,
} from '@/lib/action-loop';
import {
  FavoritePriority,
  FavoriteWithRepositorySummary,
} from '@/lib/types/repository';

export type FavoriteCardPrimaryAction =
  | {
      kind: 'detail';
      label: '查看详情';
      description: string;
    }
  | {
      kind: 'advance';
      label: '推进到尝试';
      description: string;
    };

export type FavoriteCardViewModel = {
  decisionView: RepositoryDecisionViewModel;
  statusSummary: string;
  summaryReason: string;
  worthFollowingLabel: string;
  recentChangeLabel: string;
  nextStepLabel: string;
  primaryAction: FavoriteCardPrimaryAction;
  secondaryAdvanceLabel: string;
  detailHref: string;
  githubHref: string;
};

export function buildFavoriteCardViewModel(
  favorite: FavoriteWithRepositorySummary,
  actionEntry: ActionLoopEntry | null,
): FavoriteCardViewModel {
  const decisionView = buildRepositoryDecisionViewModel(favorite.repository);
  const currentStage = actionEntry?.followUpStage ?? 'OBSERVE';
  const currentStatus = actionEntry?.actionStatus ?? 'NOT_STARTED';
  const primaryAction = selectFavoritePrimaryAction({
    decisionView,
    currentStage,
    currentStatus,
  });
  const note = favorite.note?.trim();

  return {
    decisionView,
    statusSummary: [
      getFavoritePriorityLabel(favorite.priority),
      getExecutionStatusLabel(currentStatus),
      `${getFollowUpStageLabel(currentStage)}阶段`,
    ].join(' · '),
    summaryReason: note || decisionView.display.reason,
    worthFollowingLabel: decisionView.display.worthDoingLabel,
    recentChangeLabel: getFavoriteChangeHint(favorite),
    nextStepLabel: note
      ? `按备注继续：${note}`
      : primaryAction.kind === 'advance'
        ? '现在先推进到尝试，再补一句你要验证的目标。'
        : decisionView.display.actionSentence,
    primaryAction,
    secondaryAdvanceLabel:
      currentStage === 'DECIDE'
        ? '保持决定状态'
        : `推进到${getFollowUpStageLabel(getNextFollowUpStage(currentStage))}`,
    detailHref: `/repositories/${favorite.repository.id}`,
    githubHref: `https://github.com/${favorite.repository.fullName}`,
  };
}

export function buildFavoriteActionEntryBase(
  favorite: FavoriteWithRepositorySummary,
) {
  const decisionView = buildRepositoryDecisionViewModel(favorite.repository);

  return {
    repoId: favorite.repositoryId,
    repositoryName: favorite.repository.name,
    repositoryFullName: favorite.repository.fullName,
    htmlUrl: `https://github.com/${favorite.repository.fullName}`,
    detailPath: `/repositories/${favorite.repository.id}`,
    headline: favorite.repository.name,
    reason: decisionView.display.worthDoingLabel,
    categoryLabel: decisionView.behaviorContext.categoryLabel,
    projectType: decisionView.behaviorContext.projectType,
    targetUsersLabel: decisionView.behaviorContext.targetUsersLabel,
    useCaseLabel: decisionView.behaviorContext.useCaseLabel,
    patternKeys: decisionView.behaviorContext.patternKeys,
    hasRealUser: decisionView.behaviorContext.hasRealUser,
    hasClearUseCase: decisionView.behaviorContext.hasClearUseCase,
    isDirectlyMonetizable: decisionView.behaviorContext.isDirectlyMonetizable,
  };
}

function selectFavoritePrimaryAction(args: {
  decisionView: RepositoryDecisionViewModel;
  currentStage: ActionLoopEntry['followUpStage'] | 'OBSERVE';
  currentStatus: ActionLoopEntry['actionStatus'] | 'NOT_STARTED';
}): FavoriteCardPrimaryAction {
  const canAdvanceToTry =
    args.decisionView.displayState === 'trusted' &&
    args.currentStage === 'OBSERVE' &&
    args.currentStatus === 'NOT_STARTED' &&
    args.decisionView.flags.allowStrongAction;

  if (canAdvanceToTry) {
    return {
      kind: 'advance',
      label: '推进到尝试',
      description: '信号已经足够清楚，可以先把它推进到尝试阶段。',
    };
  }

  return {
    kind: 'detail',
    label: '查看详情',
    description:
      args.currentStatus === 'IN_PROGRESS' || args.currentStatus === 'VALIDATING'
        ? '先复看当前证据和执行状态，再决定继续推进还是降级观察。'
        : '先打开详情页，再决定继续跟还是降级观察。',
  };
}

function getFavoritePriorityLabel(priority: FavoritePriority) {
  return {
    HIGH: '高优先',
    MEDIUM: '中优先',
    LOW: '低优先',
  }[priority];
}

export function getFavoriteChangeHint(item: FavoriteWithRepositorySummary) {
  if (item.updatedAt !== item.createdAt) {
    return `最近有变化 · ${formatDate(item.updatedAt)}`;
  }

  if (item.priority === 'HIGH') {
    return '高优先收藏，现在就值得复看一次判断。';
  }

  return `最近没有明显变化 · ${formatDate(item.createdAt)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
