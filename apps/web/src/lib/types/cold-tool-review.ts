export type ColdToolReviewRound = 'ROUND_1' | 'ROUND_2' | 'ROUND_3';
export type ColdToolReviewTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'RELEASED';
export type ColdToolReviewFlowStatus =
  | 'PENDING_ROUND_1'
  | 'PENDING_ROUND_2'
  | 'FINAL_CANDIDATE'
  | 'BACKUP_CANDIDATE'
  | 'NEEDS_INFO'
  | 'ELIMINATED'
  | 'ARBITRATION_PENDING';
export type ColdToolReviewDecision =
  | 'ROUND_1_KEEP'
  | 'ROUND_1_PENDING'
  | 'ROUND_1_REJECT'
  | 'ROUND_2_STRONG_KEEP'
  | 'ROUND_2_KEEP'
  | 'ROUND_2_NEEDS_INFO'
  | 'ROUND_2_REJECT';
export type ColdToolReviewQueueScope = 'myPending' | 'myReviewed';

export interface ColdToolReviewRecord {
  id: string;
  round: ColdToolReviewRound;
  reviewer: string;
  decision: ColdToolReviewDecision;
  reasonTags: string[];
  disagreementTags: string[];
  note: string | null;
  isDisputed: boolean;
  createdAt: string;
}

export interface ColdToolReviewTaskItem {
  id: string;
  analysisId: string;
  repositoryId: string;
  currentRound: ColdToolReviewRound;
  taskStatus: ColdToolReviewTaskStatus;
  flowStatus: ColdToolReviewFlowStatus;
  lockedBy: string | null;
  lockedAt: string | null;
  isLockedByMe: boolean;
  repository: {
    id: string;
    name: string;
    fullName: string;
    stars: number;
    htmlUrl: string;
  };
  card: {
    projectName: string;
    stars: number;
    repositoryUrl: string;
    oneLiner: string;
    targetUsers: string;
    useCase: string;
    payer: string;
  };
  meta: {
    fitsColdToolPool: boolean | null;
    isRealUserTool: boolean | null;
    hasPayingIntent: boolean | null;
    willingnessToPay: string;
    categoryMain: string;
    categorySub: string;
    evaluatedAt: string | null;
  };
  previousRound: ColdToolReviewRecord | null;
  currentRoundRecord: ColdToolReviewRecord | null;
  history: ColdToolReviewRecord[];
}

export interface ColdToolReviewNextResponse {
  item: ColdToolReviewTaskItem | null;
  allocated: boolean;
}

export interface ColdToolReviewStats {
  round: ColdToolReviewRound;
  lockTimeoutMinutes: number;
  myProgress: {
    completed: number;
    inProgress: number;
  };
  teamProgress: {
    total: number;
    completed: number;
    remaining: number;
    inProgress: number;
  };
  decisions: Array<{
    decision: ColdToolReviewDecision;
    count: number;
  }>;
}

export interface ColdToolReviewQueueResponse {
  items: ColdToolReviewTaskItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ColdToolReviewSubmitPayload {
  taskId: string;
  reviewer: string;
  round: ColdToolReviewRound;
  decision: ColdToolReviewDecision;
  reasonTags?: string[];
  disagreementTags?: string[];
  note?: string;
  isDisputed?: boolean;
  overrideExisting?: boolean;
}

export interface ColdToolReviewSubmitResponse {
  submitted: ColdToolReviewTaskItem;
  next: ColdToolReviewNextResponse;
}
