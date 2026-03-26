export type HomeEmptyStateAction = {
  key: 'favorites' | 'all_projects';
  href: '/favorites' | '#all-projects';
  label: '去收藏页继续收口' | '去完整机会池继续筛';
  description: string;
};

export type HomeEmptyStateViewModel = {
  statusLabel: '当前没有新的高价值方向';
  guidanceLabel: string;
  primaryAction: HomeEmptyStateAction;
};

type HomeEmptyStateInput = {
  trackedCandidates: Array<{
    isFavorited: boolean;
    actionStatus:
      | 'NOT_STARTED'
      | 'IN_PROGRESS'
      | 'VALIDATING'
      | 'COMPLETED'
      | 'DROPPED';
  }>;
};

export function buildHomeEmptyStateViewModel(
  input: HomeEmptyStateInput,
): HomeEmptyStateViewModel {
  const hasTrackedWork = input.trackedCandidates.some(
    (candidate) =>
      candidate.isFavorited ||
      candidate.actionStatus === 'IN_PROGRESS' ||
      candidate.actionStatus === 'VALIDATING',
  );

  if (hasTrackedWork) {
    return {
      statusLabel: '当前没有新的高价值方向',
      guidanceLabel:
        '优先把已经跟进的项目收口成结论，再决定继续投入、继续观察，还是直接放弃。',
      primaryAction: {
        key: 'favorites',
        href: '/favorites',
        label: '去收藏页继续收口',
        description: '先把已经跟进的项目推进成明确结论，不要让今天卡在首页。',
      },
    };
  }

  return {
    statusLabel: '当前没有新的高价值方向',
    guidanceLabel:
      '手上没有更值得立即推进的新方向时，就直接去完整机会池继续筛，不要停留在首页空转。',
    primaryAction: {
      key: 'all_projects',
      href: '#all-projects',
      label: '去完整机会池继续筛',
      description: '把首页之外的候选项目再补看一轮，今天先从可继续筛的池子里找机会。',
    },
  };
}
