import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RepositoryCompletenessLevel,
  RepositoryDecision,
  RepositoryOpportunityLevel,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BehaviorMemoryService } from '../behavior-memory/behavior-memory.service';
import {
  IdeaMainCategory,
  IdeaSubCategory,
  normalizeIdeaMainCategory,
  normalizeIdeaSubCategory,
} from './idea-snapshot-taxonomy';
import {
  AnalysisTrainingKnowledge,
  AnalysisTrainingKnowledgeService,
} from './analysis-training-knowledge.service';
import { RepositoryCachedRankingService } from './repository-cached-ranking.service';
import {
  evaluateOneLinerStrength,
  OneLinerStrength,
} from './helpers/one-liner-strength.helper';
import {
  condenseRepositoryOneLiner,
  OneLinerConfidenceLevel,
  OneLinerRiskFlag,
} from './helpers/one-liner-condenser.helper';

type RepositoryInsightTarget = Prisma.RepositoryGetPayload<{
  include: {
    analysis: true;
    content: true;
  };
}>;

export type RepositoryInsightVerdict = 'GOOD' | 'OK' | 'BAD';
export type RepositoryInsightAction = 'BUILD' | 'CLONE' | 'IGNORE';

type ProjectRealityType = 'product' | 'tool' | 'model' | 'infra' | 'demo';

type ProjectReality = {
  type: ProjectRealityType;
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  isDirectlyMonetizable: boolean;
  whyNotProduct: string | null;
};

type InsightAnchorMatch = 'GOOD' | 'CLONE' | 'BAD';

type UserBehaviorContext = {
  userSuccessPatterns?: string[];
  userFailurePatterns?: string[];
  userSuccessReasons?: string[];
  userFailureReasons?: string[];
  preferredCategories?: string[];
  avoidedCategories?: string[];
  recentValidatedWins?: string[];
  recentDroppedReasons?: string[];
  minEvidenceThreshold?: number;
  failureWeightDecay?: number;
};

type BehaviorDataFeedback = {
  userConfidenceWeight: number;
  useCaseConfidenceWeight: number;
  monetizationConfidenceWeight: number;
  confidenceWeight: number;
  shouldDegrade: boolean;
  reasons: string[];
  matchedSuccessReasons: string[];
  matchedFailureReasons: string[];
};

export type RepositoryInsightOutput = {
  oneLinerZh: string;
  oneLinerMeta?: {
    confidence: OneLinerConfidenceLevel;
    reasoning: string[];
    riskFlags: OneLinerRiskFlag[];
  };
  oneLinerStrength: OneLinerStrength;
  verdict: RepositoryInsightVerdict;
  verdictReason: string;
  action: RepositoryInsightAction;
  actionLabel: string;
  completenessScore: number;
  completenessLevel: RepositoryCompletenessLevel;
  category: {
    main: IdeaMainCategory;
    sub: IdeaSubCategory;
  };
  categoryDisplay: {
    main: string;
    sub: string;
    label: string;
  };
  projectReality?: ProjectReality;
  anchorMatch?: InsightAnchorMatch;
  confidence?: number;
  whyNotProduct?: string | null;
  summaryTags: string[];
  behaviorFeedback?: BehaviorDataFeedback;
};

type RepositoryInsightSignals = {
  ideaFitScore: number | null;
  projectReality: ProjectReality;
  promising: boolean;
  clearDemand: boolean;
  businessClarity: boolean;
  canQuicklyShip: boolean;
  easyToCopy: boolean;
  toolLike: boolean;
  apiOrSaasLike: boolean;
  automationLike: boolean;
  workflowProblem: boolean;
  chargePotential: boolean;
  smallTeamFriendly: boolean;
  reusableIdea: boolean;
  demoLike: boolean;
  templateLike: boolean;
  showcaseLike: boolean;
  scamLike: boolean;
  legalRisk: boolean;
  platformDependent: boolean;
  maintenanceWeak: boolean;
  weakProductDirection: boolean;
  crowded: boolean;
  severeRisk: boolean;
  lowBarrier: boolean;
  missingAnalysis: boolean;
  confidence: number;
  anchorMatch: InsightAnchorMatch;
  counterQuestionsResolved: boolean;
  positiveScore: number;
  negativeScore: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  tools: '工具类',
  platform: '平台类',
  ai: 'AI应用',
  data: '数据类',
  infra: '基础设施',
  content: '内容类',
  game: '游戏类',
  other: '其他',
  devtools: '开发工具',
  'ai-tools': 'AI工具',
  automation: '自动化工具',
  'data-tools': '数据工具',
  'browser-extension': '浏览器扩展',
  productivity: '效率工具',
  workflow: '工作流工具',
  cli: '命令行工具',
  'no-code': '无代码工具',
  'ops-tools': '运维工具',
  marketplace: '交易平台',
  'app-builder': '应用搭建',
  'workflow-platform': '工作流平台',
  'developer-platform': '开发者平台',
  'api-platform': 'API 平台',
  'ai-writing': 'AI写作',
  'ai-code': 'AI编程',
  'ai-agent': 'AI Agent',
  'ai-image': 'AI图像',
  'ai-search': 'AI搜索',
  'data-pipeline': '数据管道',
  analytics: '数据分析',
  scraping: '数据采集',
  etl: 'ETL 工具',
  dataset: '数据集',
  'data-observability': '数据可观测',
  deployment: '部署工具',
  observability: '可观测性',
  auth: '身份认证',
  storage: '存储服务',
  'api-gateway': 'API 网关',
  devops: 'DevOps',
  cloud: '云基础设施',
  monitoring: '监控告警',
  security: '安全工具',
  'content-creation': '内容创作',
  seo: 'SEO 工具',
  publishing: '发布分发',
  media: '媒体工具',
  'game-tooling': '游戏工具',
  'game-content': '游戏内容',
  'game-platform': '游戏平台',
};

const ACTION_LABELS: Record<RepositoryInsightAction, string> = {
  BUILD: '值得做',
  CLONE: '可以抄',
  IGNORE: '不值得做',
};

@Injectable()
export class RepositoryInsightService {
  // Product-first calibration:
  // this layer judges whether a repo can become a sellable product for a small team,
  // not whether the underlying code is merely technically impressive.
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
    private readonly repositoryCachedRankingService: RepositoryCachedRankingService,
    private readonly behaviorMemoryService: BehaviorMemoryService,
  ) {}

  async refreshInsight(
    repositoryId: string,
    behaviorContext?: UserBehaviorContext,
  ) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        analysis: true,
        content: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with id "${repositoryId}" was not found.`);
    }

    const insight = await this.buildInsight(
      repository,
      await this.mergeBehaviorContext(behaviorContext),
    );

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: repository.id,
      },
      update: {
        insightJson: insight as unknown as Prisma.InputJsonValue,
      },
      create: {
        repositoryId: repository.id,
        insightJson: insight as unknown as Prisma.InputJsonValue,
      },
    });

    await this.repositoryCachedRankingService.refreshRepositoryRanking(repository.id);

    return {
      repositoryId: repository.id,
      insight,
    };
  }

  private async buildInsight(
    repository: RepositoryInsightTarget,
    behaviorContext?: UserBehaviorContext,
  ): Promise<RepositoryInsightOutput> {
    const trainingKnowledge =
      await this.analysisTrainingKnowledgeService.getLatestKnowledge();
    const snapshot = this.readObject(repository.analysis?.ideaSnapshotJson);
    const completeness = this.readObject(repository.analysis?.completenessJson);
    const ideaFit = this.readObject(repository.analysis?.ideaFitJson);
    const extractedIdea = this.readObject(repository.analysis?.extractedIdeaJson);
    const category = this.resolveCategory(repository, snapshot);
    const categoryDisplay = this.buildCategoryDisplay(category);
    const completenessLevel = this.resolveCompletenessLevel(repository, completeness);
    const completenessScore = this.resolveCompletenessScore(
      repository,
      completeness,
      completenessLevel,
    );
    const projectReality = this.classifyProjectReality(
      repository,
      snapshot,
      completeness,
      ideaFit,
      extractedIdea,
      category,
      trainingKnowledge,
    );
    const signals = this.evaluateDecisionSignals(
      repository,
      snapshot,
      completeness,
      ideaFit,
      extractedIdea,
      completenessLevel,
      category,
      projectReality,
      trainingKnowledge,
    );
    let verdict = this.resolveVerdict(repository, signals);
    let action = this.resolveAction(verdict, signals);
    const behaviorMatch = this.matchUserBehaviorPatterns(
      repository,
      category,
      projectReality,
      behaviorContext,
    );

    if (behaviorMatch.shouldDegrade) {
      if (verdict === 'GOOD') {
        verdict = 'OK';
      }

      if (action === 'BUILD') {
        action = 'CLONE';
      }
    }

    const actionLabel = ACTION_LABELS[action];
    const resolvedOneLiner = this.resolveOneLiner(
      repository,
      snapshot,
      extractedIdea,
      category,
      projectReality,
    );
    const oneLinerZh = resolvedOneLiner.oneLinerZh;
    const oneLinerStrength = evaluateOneLinerStrength({
      oneLinerZh,
      projectReality,
      stars: repository.stars,
      categoryMain: category.main,
      categorySub: category.sub,
      riskFlags: resolvedOneLiner.oneLinerMeta.riskFlags,
      ideaFitScore: signals.ideaFitScore,
      verdict,
      action,
    });

    return {
      oneLinerZh,
      oneLinerMeta: resolvedOneLiner.oneLinerMeta,
      oneLinerStrength,
      verdict,
      verdictReason: this.mergeBehaviorVerdictReason(
        this.resolveVerdictReason(
        signals,
        categoryDisplay,
        completenessLevel,
        action,
        projectReality,
        ),
        behaviorMatch,
      ),
      action,
      actionLabel,
      completenessScore,
      completenessLevel,
      category,
      categoryDisplay,
      projectReality,
      anchorMatch: signals.anchorMatch,
      confidence: this.clampConfidence(
        signals.confidence + behaviorMatch.confidenceDelta,
      ),
      whyNotProduct: projectReality.whyNotProduct,
      summaryTags: this.buildSummaryTags(
        repository,
        snapshot,
        verdict,
        action,
        categoryDisplay,
        signals,
        behaviorMatch,
      ),
      behaviorFeedback: behaviorMatch.feedback,
    };
  }

  private resolveOneLiner(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
    extractedIdea: Record<string, unknown> | null,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
    projectReality: ProjectReality,
  ): {
    oneLinerZh: string;
    oneLinerMeta: {
      confidence: OneLinerConfidenceLevel;
      reasoning: string[];
      riskFlags: OneLinerRiskFlag[];
    };
  } {
    const source =
      this.cleanText(extractedIdea?.ideaSummary, 180) ||
      this.cleanText(snapshot?.oneLinerZh, 180) ||
      this.cleanText(repository.description, 180);

    const candidate = this.ensureSpecificOneLiner(
      this.resolveRealityCheckedOneLiner(
        repository,
        snapshot,
        extractedIdea,
        category,
        projectReality,
      ) ||
        this.resolveStructuredOneLiner(extractedIdea, repository, category) ||
        this.humanizeOneLiner(source, repository, category),
      repository,
      extractedIdea,
      category,
      projectReality,
    );
    const condensed = condenseRepositoryOneLiner({
      repository: {
        name: repository.name,
        fullName: repository.fullName,
        description: repository.description,
        topics: repository.topics ?? [],
        readmeText: repository.content?.readmeText ?? null,
      },
      projectType: projectReality.type,
      candidate: candidate || null,
      fallback:
        this.cleanText(snapshot?.oneLinerZh, 180) ||
        this.cleanText(repository.description, 180) ||
        this.fallbackOneLiner(repository, category),
      signals: {
        hasRealUser: projectReality.hasRealUser,
        hasClearUseCase: projectReality.hasClearUseCase,
        isDirectlyMonetizable: projectReality.isDirectlyMonetizable,
        categoryMain: category.main,
        categorySub: category.sub,
      },
    });

    return {
      oneLinerZh: condensed.oneLinerZh,
      oneLinerMeta: {
        confidence: condensed.confidence,
        reasoning: condensed.reasoning,
        riskFlags: condensed.riskFlags,
      },
    };
  }

  private resolveVerdict(
    repository: RepositoryInsightTarget,
    signals: RepositoryInsightSignals,
  ): RepositoryInsightVerdict {
    if (signals.anchorMatch === 'BAD' || signals.scamLike || signals.severeRisk) {
      return 'BAD';
    }

    if (
      signals.projectReality.type === 'model' ||
      signals.projectReality.type === 'infra' ||
      signals.projectReality.type === 'demo'
    ) {
      return 'OK';
    }

    if (
      !signals.projectReality.hasRealUser ||
      !signals.projectReality.hasClearUseCase ||
      !signals.projectReality.isDirectlyMonetizable ||
      !signals.counterQuestionsResolved ||
      signals.confidence < 0.6 ||
      signals.anchorMatch !== 'GOOD'
    ) {
      return 'OK';
    }

    if (
      ((signals.templateLike || signals.showcaseLike || signals.demoLike) &&
        !signals.clearDemand &&
        !signals.businessClarity) ||
      (signals.maintenanceWeak &&
        !signals.clearDemand &&
        !signals.reusableIdea &&
        !signals.toolLike) ||
      (signals.weakProductDirection && !signals.reusableIdea) ||
      (signals.negativeScore >= 6 && signals.positiveScore <= 2)
    ) {
      return 'BAD';
    }

    if (
      (signals.projectReality.type === 'product' ||
        signals.projectReality.type === 'tool') &&
      signals.projectReality.hasRealUser &&
      signals.projectReality.hasClearUseCase &&
      signals.projectReality.isDirectlyMonetizable &&
      signals.clearDemand &&
      signals.businessClarity &&
      signals.chargePotential &&
      (signals.apiOrSaasLike || signals.automationLike || signals.toolLike) &&
      (signals.canQuicklyShip || signals.smallTeamFriendly || signals.promising) &&
      !signals.legalRisk &&
      !signals.platformDependent &&
      !signals.templateLike &&
      !signals.showcaseLike &&
      signals.positiveScore >= 7 &&
      signals.negativeScore <= 5
    ) {
      return 'GOOD';
    }

    if (
      repository.opportunityLevel === RepositoryOpportunityLevel.HIGH &&
      repository.decision === RepositoryDecision.RECOMMENDED &&
      (signals.projectReality.type === 'product' ||
        signals.projectReality.type === 'tool') &&
      signals.projectReality.hasRealUser &&
      signals.projectReality.hasClearUseCase &&
      signals.projectReality.isDirectlyMonetizable &&
      !signals.legalRisk &&
      !signals.platformDependent &&
      signals.clearDemand &&
      signals.chargePotential
    ) {
      return 'GOOD';
    }

    return 'OK';
  }

  private resolveVerdictReason(
    signals: RepositoryInsightSignals,
    categoryDisplay: {
      main: string;
      sub: string;
      label: string;
    },
    completenessLevel: RepositoryCompletenessLevel,
    action: RepositoryInsightAction,
    projectReality: ProjectReality,
  ) {
    if (signals.anchorMatch === 'CLONE' && signals.confidence < 0.6) {
      return '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。';
    }

    if (projectReality.type === 'model') {
      return `这更像模型或能力层框架${projectReality.whyNotProduct ? `，${projectReality.whyNotProduct}` : ''}，更适合作为技术能力参考。`;
    }

    if (projectReality.type === 'infra') {
      return `这更像底层基础设施或能力封装${projectReality.whyNotProduct ? `，${projectReality.whyNotProduct}` : ''}，适合借鉴底层方案，但不该直接当成创业产品判断。`;
    }

    if (projectReality.type === 'demo') {
      return `这更像示例、模板或演示项目${projectReality.whyNotProduct ? `，${projectReality.whyNotProduct}` : ''}，缺少真实产品边界和明确付费场景。`;
    }

    if (signals.scamLike) {
      return '这个项目噱头大于价值，看起来更像拿暴利故事吸引人，不值得继续投入。';
    }

    if ((signals.templateLike || signals.showcaseLike || signals.demoLike) && !signals.clearDemand) {
      return '这更像展示、模板或练手项目，不像一个会被长期付费使用的产品。';
    }

    if (action === 'IGNORE' && signals.maintenanceWeak && !signals.clearDemand) {
      return '这个项目既不完整也没有清晰产品方向，继续投入时间的意义不大。';
    }

    if (action === 'BUILD' && signals.workflowProblem && signals.chargePotential) {
      if (signals.crowded) {
        return '这个方向需求明确，虽然同类不少，但只要切口更准，还是值得继续做。';
      }

      return '这是个典型工具型机会，问题明确，也有机会很快包装成收费产品。';
    }

    if (action === 'BUILD' && signals.smallTeamFriendly) {
      return '这个方向解决的是明确效率问题，小团队也有机会比较快把它做出来。';
    }

    if (action === 'CLONE' && signals.legalRisk) {
      return '需求是真实存在的，但当前实现风险不小，更适合换个更稳的做法再做。';
    }

    if (action === 'CLONE' && signals.platformDependent) {
      return '想法本身没错，但太依赖上游平台，更适合借鉴思路而不是原样跟。';
    }

    if (action === 'CLONE' && signals.crowded) {
      return '这个方向本身没问题，但同类已经很多，更适合借鉴做法后换个切口。';
    }

    if (action === 'CLONE' && (signals.clearDemand || signals.reusableIdea)) {
      return '想法是成立的，但产品差异化还不够强，更适合先拆思路再重做。';
    }

    if (signals.clearDemand && completenessLevel === RepositoryCompletenessLevel.LOW) {
      return '方向不算错，但项目还不够完整，暂时还撑不起一个清晰产品。';
    }

    if (!signals.counterQuestionsResolved) {
      return '这个项目暂时回答不清“谁会用、为什么会付钱、不用会怎样”，所以先按可借鉴处理。';
    }

    if (signals.missingAnalysis) {
      return '当前分析还不完整，先补齐关键判断，再决定要不要继续跟进会更稳。';
    }

    return `这个${categoryDisplay.label}方向暂时还看不出足够清楚的需求，继续投入的优先级不高。`;
  }

  private mergeBehaviorVerdictReason(
    baseReason: string,
    behaviorMatch: {
      matchedSuccessPatterns: string[];
      matchedFailurePatterns: string[];
      shouldDegrade: boolean;
      feedback: BehaviorDataFeedback;
    },
  ) {
    if (behaviorMatch.shouldDegrade) {
      const detail = behaviorMatch.feedback.reasons[0]
        ? ` ${behaviorMatch.feedback.reasons[0]}`
        : '';
      return `${baseReason} 你过去在相似方向上更容易放弃，这次先按更保守的动作处理。${detail}`;
    }

    if (behaviorMatch.matchedSuccessPatterns.length) {
      return `${baseReason} 这也更贴近你已经推进成功过的方向。`;
    }

    if (behaviorMatch.feedback.reasons.length > 0) {
      return `${baseReason} ${behaviorMatch.feedback.reasons[0]}`;
    }

    return baseReason;
  }

  private clampConfidence(value: number) {
    if (value <= 0) {
      return 0.05;
    }

    if (value >= 1) {
      return 0.95;
    }

    return Math.round(value * 100) / 100;
  }

  private resolveAction(
    verdict: RepositoryInsightVerdict,
    signals: RepositoryInsightSignals,
  ): RepositoryInsightAction {
    if (
      signals.scamLike ||
      signals.severeRisk ||
      ((signals.templateLike || signals.showcaseLike || signals.demoLike) &&
        !signals.clearDemand) ||
      (signals.maintenanceWeak && !signals.reusableIdea && !signals.clearDemand) ||
      signals.weakProductDirection
    ) {
      return 'IGNORE';
    }

    if (
      signals.projectReality.type === 'model' ||
      signals.projectReality.type === 'infra' ||
      signals.projectReality.type === 'demo'
    ) {
      return 'CLONE';
    }

    if (
      !signals.projectReality.hasRealUser ||
      !signals.projectReality.hasClearUseCase ||
      !signals.projectReality.isDirectlyMonetizable ||
      !signals.counterQuestionsResolved ||
      signals.confidence < 0.6 ||
      signals.anchorMatch === 'CLONE'
    ) {
      return verdict === 'BAD' ? 'IGNORE' : 'CLONE';
    }

    if (!signals.legalRisk && !signals.platformDependent && verdict === 'GOOD') {
      return 'BUILD';
    }

    if (
      (signals.clearDemand &&
        signals.chargePotential &&
        signals.promising &&
        signals.smallTeamFriendly &&
        !signals.crowded &&
        !signals.reusableIdea &&
        !signals.easyToCopy &&
        !signals.legalRisk &&
        !signals.platformDependent) ||
      (verdict === 'OK' &&
        signals.promising &&
        signals.clearDemand &&
        signals.businessClarity &&
        signals.chargePotential &&
        signals.canQuicklyShip &&
        !signals.crowded &&
        !signals.legalRisk &&
        !signals.platformDependent &&
        !signals.reusableIdea &&
        !signals.easyToCopy &&
        !signals.lowBarrier &&
        !signals.severeRisk &&
        !signals.templateLike &&
        !signals.showcaseLike &&
        !signals.demoLike)
    ) {
      return 'BUILD';
    }

    if (
      signals.reusableIdea ||
      signals.easyToCopy ||
      signals.crowded ||
      signals.legalRisk ||
      signals.platformDependent ||
      verdict === 'OK'
    ) {
      return 'CLONE';
    }

    return 'IGNORE';
  }

  private resolveCompletenessLevel(
    repository: RepositoryInsightTarget,
    completeness: Record<string, unknown> | null,
  ) {
    const rawLevel =
      repository.completenessLevel ??
      this.cleanText(completeness?.completenessLevel, 10).toUpperCase();

    switch (rawLevel) {
      case RepositoryCompletenessLevel.HIGH:
      case 'HIGH':
        return RepositoryCompletenessLevel.HIGH;
      case RepositoryCompletenessLevel.MEDIUM:
      case 'MEDIUM':
        return RepositoryCompletenessLevel.MEDIUM;
      case RepositoryCompletenessLevel.LOW:
      case 'LOW':
      default:
        return RepositoryCompletenessLevel.LOW;
    }
  }

  private resolveCompletenessScore(
    repository: RepositoryInsightTarget,
    completeness: Record<string, unknown> | null,
    completenessLevel: RepositoryCompletenessLevel,
  ) {
    const score =
      this.toNumber(repository.completenessScore) ??
      this.readNumber(completeness?.completenessScore);

    if (typeof score === 'number') {
      return score;
    }

    switch (completenessLevel) {
      case RepositoryCompletenessLevel.HIGH:
        return 85;
      case RepositoryCompletenessLevel.MEDIUM:
        return 60;
      case RepositoryCompletenessLevel.LOW:
      default:
        return 0;
    }
  }

  private resolveCategory(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
  ) {
    const snapshotCategory =
      snapshot?.category && typeof snapshot.category === 'object'
        ? (snapshot.category as Record<string, unknown>)
        : null;

    const main = normalizeIdeaMainCategory(
      repository.categoryL1 ?? snapshotCategory?.main ?? this.detectCategoryMain(repository),
    );
    const sub = normalizeIdeaSubCategory(
      main,
      repository.categoryL2 ??
        snapshotCategory?.sub ??
        this.detectCategorySub(repository, main),
    );

    return {
      main,
      sub,
    };
  }

  private buildCategoryDisplay(category: {
    main: IdeaMainCategory;
    sub: IdeaSubCategory;
  }) {
    const main = CATEGORY_LABELS[category.main] ?? '其他';
    const sub = CATEGORY_LABELS[category.sub] ?? main;

    return {
      main,
      sub,
      label: sub && sub !== main ? `${main} / ${sub}` : main,
    };
  }

  private buildSummaryTags(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
    verdict: RepositoryInsightVerdict,
    action: RepositoryInsightAction,
    categoryDisplay: {
      main: string;
      sub: string;
      label: string;
    },
    signals: RepositoryInsightSignals,
    behaviorMatch: {
      matchedSuccessPatterns: string[];
      matchedFailurePatterns: string[];
      shouldDegrade: boolean;
      feedback: BehaviorDataFeedback;
    },
  ) {
    const tags: string[] = [];

    if (this.isRecentlyCreated(repository.createdAtGithub)) {
      tags.push('新项目');
    }

    if (action === 'BUILD' || verdict === 'GOOD') {
      tags.push('有商业潜力');
    } else if (action === 'CLONE') {
      tags.push('可以借鉴');
    } else {
      tags.push('不建议投入');
    }

    tags.push(categoryDisplay.sub || categoryDisplay.main || '待分类');

    if (signals.projectReality.type === 'model') {
      tags.push('模型能力层');
    } else if (signals.projectReality.type === 'infra') {
      tags.push('基础能力层');
    } else if (signals.projectReality.type === 'demo') {
      tags.push('演示项目');
    }

    if (signals.confidence < 0.6) {
      tags.push('判断待确认');
    }

    if (signals.canQuicklyShip && action === 'BUILD') {
      tags.push('可快速上线');
    } else if (signals.legalRisk || signals.scamLike || signals.showcaseLike) {
      tags.push('风险偏高');
    } else if (signals.easyToCopy && action === 'CLONE') {
      tags.push('可快速上线');
    }

    if (snapshot?.nextAction === 'DEEP_ANALYZE') {
      tags.push('值得深读');
    }

    if (signals.missingAnalysis) {
      tags.push('待补分析');
    } else {
      tags.push('已完成分析');
    }

    if (!repository.isFavorited && verdict !== 'BAD') {
      tags.push('待收藏');
    }

    if (signals.clearDemand && signals.businessClarity && action === 'BUILD') {
      tags.push('需求明确');
    }

    if (behaviorMatch.shouldDegrade) {
      tags.push('避开失败方向');
    } else if (behaviorMatch.matchedSuccessPatterns.length) {
      tags.push('贴近成功方向');
    } else if (behaviorMatch.feedback.reasons.length > 0) {
      tags.push('按历史结果校正');
    }

    return Array.from(new Set(tags)).slice(0, 5);
  }

  private matchUserBehaviorPatterns(
    repository: RepositoryInsightTarget,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
    projectReality: ProjectReality,
    context?: UserBehaviorContext,
  ) {
    const successPatterns = new Set(
      (context?.userSuccessPatterns ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const failurePatterns = new Set(
      (context?.userFailurePatterns ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const preferredCategories = new Set(
      (context?.preferredCategories ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const avoidedCategories = new Set(
      (context?.avoidedCategories ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const successReasons = new Set(
      (context?.userSuccessReasons ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const failureReasons = new Set(
      (context?.userFailureReasons ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const recentValidatedWins = new Set(
      (context?.recentValidatedWins ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const recentDroppedReasons = new Set(
      (context?.recentDroppedReasons ?? []).map((item) => this.cleanPatternValue(item)),
    );
    const failureWeightDecay =
      typeof context?.failureWeightDecay === 'number'
        ? context.failureWeightDecay
        : 0.7;
    const existingInsight = this.readObject(repository.analysis?.insightJson);
    const existingSummaryTags = this.readStringArray(existingInsight?.summaryTags);
    const candidatePatterns = Array.from(
      new Set(
        [
          this.buildBehaviorPattern('category', this.buildCategoryDisplay(category).label),
          this.buildBehaviorPattern('subcategory', CATEGORY_LABELS[category.sub] ?? category.sub),
          this.buildBehaviorPattern('type', projectReality.type),
          ...(existingSummaryTags
            .map((item) => this.buildBehaviorPattern('usecase', item))
            .filter((item): item is string => Boolean(item))
            .slice(0, 3)),
        ].filter((item): item is string => Boolean(item)),
      ),
    );

    const matchedSuccessPatterns = candidatePatterns.filter((item) =>
      successPatterns.has(item),
    );
    const matchedFailurePatterns = candidatePatterns.filter((item) =>
      failurePatterns.has(item),
    );
    const categoryLabel = this.cleanPatternValue(this.buildCategoryDisplay(category).label);
    const matchedPreferredCategories = categoryLabel && preferredCategories.has(categoryLabel);
    const matchedAvoidedCategories = categoryLabel && avoidedCategories.has(categoryLabel);
    const matchedSuccessReasons = [
      projectReality.hasRealUser && successReasons.has('REAL_USER_CONFIRMED')
        ? 'REAL_USER_CONFIRMED'
        : null,
      projectReality.hasClearUseCase && successReasons.has('CLEAR_USE_CASE')
        ? 'CLEAR_USE_CASE'
        : null,
      projectReality.isDirectlyMonetizable &&
      successReasons.has('MONETIZATION_CONFIRMED')
        ? 'MONETIZATION_CONFIRMED'
        : null,
      (projectReality.type === 'product' || projectReality.type === 'tool') &&
      successReasons.has('FAST_TO_BUILD')
        ? 'FAST_TO_BUILD'
        : null,
    ].filter((item): item is string => Boolean(item));
    const matchedFailureReasons = [
      !projectReality.hasRealUser && failureReasons.has('NO_REAL_USER')
        ? 'NO_REAL_USER'
        : null,
      !projectReality.hasClearUseCase && failureReasons.has('WRONG_DIRECTION')
        ? 'WRONG_DIRECTION'
        : null,
      !projectReality.isDirectlyMonetizable &&
      failureReasons.has('WEAK_MONETIZATION')
        ? 'WEAK_MONETIZATION'
        : null,
      (projectReality.type === 'infra' ||
        projectReality.type === 'model' ||
        projectReality.type === 'demo') &&
      failureReasons.has('TOO_INFRA_HEAVY')
        ? 'TOO_INFRA_HEAVY'
        : null,
      failureReasons.has('LOW_CONFIDENCE_ANALYSIS') &&
      (!projectReality.hasRealUser ||
        !projectReality.hasClearUseCase ||
        !projectReality.isDirectlyMonetizable)
        ? 'LOW_CONFIDENCE_ANALYSIS'
        : null,
    ].filter((item): item is string => Boolean(item));
    const infraHeavy =
      projectReality.type === 'infra' || category.main === 'infra' || category.sub === 'security';
    const droppedForInfra =
      infraHeavy && recentDroppedReasons.has('TOO_INFRA_HEAVY');
    const validatedFastBuild =
      candidatePatterns.some((item) => recentValidatedWins.has(item)) ||
      recentValidatedWins.has('FAST_TO_BUILD') ||
      recentValidatedWins.has('CLEAR_USE_CASE');
    let userConfidenceWeight = 0;
    let useCaseConfidenceWeight = 0;
    let monetizationConfidenceWeight = 0;
    const feedbackReasons: string[] = [];

    if (matchedSuccessReasons.includes('REAL_USER_CONFIRMED')) {
      userConfidenceWeight += 0.65;
    }
    if (matchedFailureReasons.includes('NO_REAL_USER')) {
      userConfidenceWeight -= 1.1;
      feedbackReasons.push('你最近在缺少真实用户的方向上更容易放弃，这次先把用户判断压低一点。');
    }

    if (matchedSuccessReasons.includes('CLEAR_USE_CASE')) {
      useCaseConfidenceWeight += 0.7;
    }
    if (matchedFailureReasons.includes('WRONG_DIRECTION')) {
      useCaseConfidenceWeight -= 1;
      feedbackReasons.push('你最近更容易放弃场景不清晰的项目，所以这次先按更保守的场景判断处理。');
    }

    if (matchedSuccessReasons.includes('MONETIZATION_CONFIRMED')) {
      monetizationConfidenceWeight += 0.75;
    }
    if (matchedFailureReasons.includes('WEAK_MONETIZATION')) {
      monetizationConfidenceWeight -= 1.15;
      feedbackReasons.push('你最近放弃过收费路径偏弱的方向，所以这次先压低商业化置信。');
    }

    if (matchedFailureReasons.includes('TOO_INFRA_HEAVY')) {
      feedbackReasons.push('你最近放弃过偏 infra-heavy 的方向，所以这类项目会更保守。');
    }

    const feedback: BehaviorDataFeedback = {
      userConfidenceWeight,
      useCaseConfidenceWeight,
      monetizationConfidenceWeight,
      confidenceWeight:
        userConfidenceWeight + useCaseConfidenceWeight + monetizationConfidenceWeight,
      shouldDegrade:
        matchedFailureReasons.length > 0 &&
        matchedSuccessReasons.length === 0 &&
        !validatedFastBuild,
      reasons: Array.from(new Set(feedbackReasons)).slice(0, 2),
      matchedSuccessReasons,
      matchedFailureReasons,
    };

    return {
      matchedSuccessPatterns,
      matchedFailurePatterns,
      shouldDegrade:
        matchedFailurePatterns.length > 0 ||
        Boolean(matchedAvoidedCategories) ||
        droppedForInfra ||
        feedback.shouldDegrade,
      confidenceDelta:
        matchedFailurePatterns.length > 0 ||
        matchedAvoidedCategories ||
        droppedForInfra ||
        feedback.shouldDegrade
          ? -0.08 * failureWeightDecay + feedback.confidenceWeight * 0.03
          : matchedSuccessPatterns.length > 0 ||
              matchedPreferredCategories ||
              validatedFastBuild
            ? 0.04 + feedback.confidenceWeight * 0.03
            : 0,
      feedback,
    };
  }

  private buildBehaviorPattern(prefix: string, value: string | null | undefined) {
    const normalized = this.cleanPatternValue(value);
    return normalized ? `${prefix}:${normalized}` : null;
  }

  private cleanPatternValue(value: unknown) {
    const normalized = this.cleanText(value, 120)
      ?.replace(/\s+/g, ' ')
      .trim();

    if (
      !normalized ||
      normalized.length < 2 ||
      normalized.length > 80 ||
      /目标用户还需要继续确认|先确认谁会持续使用它|收费路径还不够清楚|更适合先验证价值/.test(
        normalized,
      )
    ) {
      return null;
    }

    return normalized;
  }

  private classifyProjectReality(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
    completeness: Record<string, unknown> | null,
    ideaFit: Record<string, unknown> | null,
    extractedIdea: Record<string, unknown> | null,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
    trainingKnowledge: AnalysisTrainingKnowledge | null,
  ): ProjectReality {
    const haystack = this.buildInsightHaystack(
      repository,
      snapshot,
      completeness,
      ideaFit,
      extractedIdea,
    );
    const targetUsers = this.readStringArray(extractedIdea?.targetUsers);
    const snapshotLine = this.cleanText(snapshot?.oneLinerZh, 180);
    const description = this.cleanText(repository.description, 220);
    const heuristicAdjustments =
      trainingKnowledge?.heuristicAdjustments ?? null;
    const hasClearUseCase =
      Boolean(this.cleanText(extractedIdea?.problem, 220)) ||
      Boolean(this.cleanText(extractedIdea?.solution, 220)) ||
      Boolean(this.cleanText(extractedIdea?.productForm, 40)) ||
      this.hasConcreteUseCaseLine(snapshotLine) ||
      this.hasConcreteUseCaseLine(description);
    const hasExplicitUserRole =
      /(platform engineering|platform engineers|devops team|security team|backend developers?|frontend developers?|product managers?|designers?|operators?|site owners?|job seekers?|lawyers?|developers?|engineers?|平台工程|运维团队|安全团队|后端开发者|前端开发者|产品经理|设计师|运营人员|求职者|律师|开发者|工程师)/i.test(
        haystack,
      );
    const hasUserContextVerb =
      /(for\b|面向|用于|帮助|help(?:s|ing)?|designed for|built for|used by)/i.test(
        haystack,
      );
    const hasRealUser =
      targetUsers.length > 0 ||
      (hasExplicitUserRole && (hasUserContextVerb || hasClearUseCase));

    let modelLike =
      /(llm|language model|multimodal|vision-language|vlm|diffusion|checkpoint|pretrain|pretrain|training|train\b|fine-?tune|benchmark|evaluation|dataset|arxiv|paper|inference demo|model zoo|foundation model|moe\b|embedding model)/i.test(
        haystack,
      );
    if (
      /(model context protocol|mcp server)/i.test(haystack) &&
      !/(checkpoint|fine-?tune|benchmark|dataset|embedding model|foundation model)/i.test(
        haystack,
      )
    ) {
      modelLike = false;
    }
    const demoLike =
      /(this is a template|template repository|starter kit|boilerplate|scaffold|reference implementation|demo app|sample app|sample project|tutorial project|course project|practice project|learning project)/i.test(
        haystack,
      ) ||
      (heuristicAdjustments &&
        heuristicAdjustments.templateDetectionBoost >= 0.18 &&
        /(template|project template|starter scaffold|starter kit|boilerplate|scaffold|reference implementation)/i.test(
          haystack,
        ));
    const infraLike =
      /(framework|runtime|sdk|library|middleware|engine|protocol|compiler|kernel|gateway|orchestration framework|mcp server|mcp gateway|inference server|serving stack|agent framework|proxy|router|provider|fallback layer)/i.test(
        haystack,
      );
    const needsHeavyInfra =
      modelLike ||
      /(training|gpu cluster|distributed training|fine-?tune|pretrain|serving stack|inference engine|model runtime)/i.test(
        haystack,
      );
    const qualifiedDeveloperTool =
      (heuristicAdjustments?.toolBoundaryBoost ?? 0) >= 0.18 &&
      /(developer|developers|engineer|engineering|devops|platform team|开发者|工程师|研发团队)/i.test(
        haystack,
      ) &&
      /(workflow|approval|review|diff|monitor|dashboard|guardrail|automation|api|sdk|cli|terminal|pull request|code review|audit|工作流|审批|审查|自动化)/i.test(
        haystack,
      );

    let type: ProjectRealityType = 'tool';
    let whyNotProduct: string | null = null;

    if (demoLike) {
      type = 'demo';
      whyNotProduct = '演示或模板项目';
    } else if (modelLike) {
      type = 'model';
      whyNotProduct = '模型或能力层仓库';
    } else if (
      infraLike &&
      ((/framework|sdk|library|proxy|router|gateway|provider|mcp server/i.test(
        haystack,
      ) &&
        !/(approval|request|approve|access control|audit|dashboard|console|workspace|temporary access|kubectl exec|policy evaluates risk)/i.test(
          haystack,
        )) ||
        !hasRealUser ||
        !hasClearUseCase)
    ) {
      type = 'infra';
      whyNotProduct = '偏底层基础设施能力';
    } else if (hasRealUser && hasClearUseCase) {
      type =
        category.main === 'platform' ||
        /(saas|workspace|portal|console|dashboard|service|platform|marketplace)/i.test(
          haystack,
        )
          ? 'product'
          : 'tool';
    } else if (infraLike) {
      type = 'infra';
      whyNotProduct = '底层能力封装多于产品场景';
    }

    const shouldRelaxMonetization =
      (heuristicAdjustments?.monetizationRelief ?? 0) >= 0.18 &&
      qualifiedDeveloperTool &&
      !demoLike &&
      !modelLike &&
      !infraLike;
    const isDirectlyMonetizable =
      (type === 'product' || type === 'tool') &&
      hasRealUser &&
      hasClearUseCase &&
      (!needsHeavyInfra || shouldRelaxMonetization);

    if (!hasRealUser && !whyNotProduct) {
      whyNotProduct = '缺少明确用户';
    } else if (!hasClearUseCase && !whyNotProduct) {
      whyNotProduct = '缺少清晰使用场景';
    } else if (!isDirectlyMonetizable && !whyNotProduct) {
      whyNotProduct = '更像能力层而不是可直接收费产品';
    }

    return {
      type,
      hasRealUser,
      hasClearUseCase,
      isDirectlyMonetizable,
      whyNotProduct,
    };
  }

  private evaluateDecisionSignals(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
    completeness: Record<string, unknown> | null,
    ideaFit: Record<string, unknown> | null,
    extractedIdea: Record<string, unknown> | null,
    completenessLevel: RepositoryCompletenessLevel,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
    projectReality: ProjectReality,
    trainingKnowledge: AnalysisTrainingKnowledge | null,
  ): RepositoryInsightSignals {
    const ideaFitScore =
      this.toNumber(repository.ideaFitScore) ??
      this.readNumber(ideaFit?.ideaFitScore);
    const haystack = this.buildInsightHaystack(
      repository,
      snapshot,
      completeness,
      ideaFit,
      extractedIdea,
    );
    const targetUsers = this.readStringArray(extractedIdea?.targetUsers);
    const problem = this.cleanText(extractedIdea?.problem, 220);
    const solution = this.cleanText(extractedIdea?.solution, 220);
    const monetization = this.cleanText(extractedIdea?.monetization, 220);
    const productForm = this.cleanText(extractedIdea?.productForm, 40);
    const snapshotPromising = snapshot?.isPromising === true;
    const snapshotSkip = this.cleanText(snapshot?.nextAction, 20) === 'SKIP';
    const heuristicAdjustments =
      trainingKnowledge?.heuristicAdjustments ?? null;
    const toolLike =
      snapshot?.toolLike === true || (this.toNumber(repository.toolLikeScore) ?? 0) >= 65;
    const apiOrSaasLike =
      ['SAAS', 'API', 'TOOL_SITE', 'PLUGIN'].includes(productForm.toUpperCase()) ||
      /(saas|api|managed service|hosted|subscription|sdk|tool site|service|dashboard|integration|auth|storage|gateway)/i.test(
        haystack,
      );
    const automationLike =
      /(automation|automate|workflow|agent|assistant|copilot|ops|sync|trigger|coordination|integration|productivity|orchestration|extension|cli|deploy|scraping|etl|dashboard|no-code)/i.test(
        haystack,
      );
    const workflowProblem =
      /(manual|friction|workflow|repetitive|review|coordination|memory|search|deploy|monitor|sync|integration|debug|handoff|auth|scrape|etl|dashboard|效率|痛点|成本|上下文|尽调)/i.test(
        haystack,
      );
    const developerWorkflowTool =
      /(developer|developers|engineer|engineering|devops|platform team|reviewer|开发者|工程师|研发团队)/i.test(
        haystack,
      ) &&
      /(workflow|approval|review|diff|monitor|dashboard|guardrail|automation|api|sdk|cli|terminal|pull request|code review|audit|工作流|审批|审查|自动化)/i.test(
        haystack,
      );
    const chargePotential =
      Boolean(monetization) ||
      apiOrSaasLike ||
      ((heuristicAdjustments?.monetizationRelief ?? 0) >= 0.18 &&
        developerWorkflowTool &&
        projectReality.hasRealUser &&
        projectReality.hasClearUseCase) ||
      /(pricing|subscription|enterprise|paid|收费|付费|tier|seat|api access|sla)/i.test(
        haystack,
      );
    const promising =
      snapshotPromising ||
      this.cleanText(snapshot?.nextAction, 40) === 'DEEP_ANALYZE' ||
      repository.decision === RepositoryDecision.RECOMMENDED ||
      repository.opportunityLevel === RepositoryOpportunityLevel.HIGH ||
      (typeof ideaFitScore === 'number' && ideaFitScore >= 78);
    const clearDemand =
      projectReality.hasClearUseCase ||
      Boolean(problem) ||
      /(need|pain|workflow|developers?|teams?|users?|需求|效率|成本|自动化|搜索|协作|代理|telegram|code|developer|assistant|productivity|deployment|monitoring|integration|browser extension|scraping|etl|dashboard)/i.test(
        haystack,
      );
    const businessClarity =
      projectReality.hasRealUser ||
      Boolean(solution) ||
      Boolean(monetization) ||
      Boolean(productForm) ||
      targetUsers.length > 0;
    const canQuicklyShip =
      completenessLevel !== RepositoryCompletenessLevel.LOW &&
      (toolLike || Boolean(solution) || Boolean(productForm) || repository.roughPass);
    const easyToCopy =
      toolLike ||
      /(plugin|extension|wrapper|dashboard|api|automation|workflow|telegram|assistant|bot|search api|sdk|integration|scraping|etl|no-code)/i.test(
        haystack,
      );
    const lowBarrier =
      easyToCopy ||
      /(plugin|extension|wrapper|dashboard|landing page|bot|telegram|automation)/i.test(
        haystack,
      );
    const templateLike =
      /(template|boilerplate|starter|scaffold|practice|tutorial|course|example|sample|awesome list|awesome-|awesome\s)/i.test(
        haystack,
      ) ||
      ((heuristicAdjustments?.templateDetectionBoost ?? 0) >= 0.18 &&
        /(reference implementation|starter kit|project template)/i.test(
          haystack,
        ));
    const showcaseLike =
      /(showcase|landing page|ui clone|clone ui|portfolio|design copy|视觉稿|页面克隆)/i.test(
        haystack,
      );
    const demoLike =
      templateLike ||
      showcaseLike ||
      /(demo|playground|learning|练手|演示项目)/i.test(haystack);
    const scamLike =
      /(scam|passive income|guaranteed profit|profit bot|mempool sniper|pump|sniper|airdrop|一键赚钱|被动收入|稳赚|暴利|暴富|套利赚钱|无风险套利|收割)/i.test(
        haystack,
      );
    const legalRisk =
      /(litigation|cease-and-desist|legal risk|legally precarious|cc by-nc|cc-by-nc|non-commercial|license restricts|license prohibits|scraping|anti-bot|terms of service|tos violation|license blocks|合规风险|法律风险|侵权|禁用条款)/i.test(
        haystack,
      );
    const platformDependent =
      /(upstream|upstream provider|official plugin|plugin ecosystem|platform dependency|ecosystem|openclaw|claude code users|telegram integration|telegram plugin|telegram bot|slack app|discord bot|mcp gateway|mcp server|上游依赖|平台依赖|依赖上游平台)/i.test(
        haystack,
      );
    const maintenanceWeak =
      completenessLevel === RepositoryCompletenessLevel.LOW ||
      /(zero community validation|missing docker|missing \.env|no env example|no documentation|incomplete technical foundation|no tests|no ci|runability hard|缺少文档|缺少运行说明)/i.test(
        haystack,
      );
    const crowded =
      /(competition|crowded|incumbent|同类|竞品|established players?|strong incumbents?)/i.test(
        haystack,
      );
    const missingAnalysis = this.hasMissingAnalysis(repository.analysis);
    const smallTeamFriendly =
      canQuicklyShip && (toolLike || apiOrSaasLike || automationLike || lowBarrier);
    const weakProductDirection =
      !clearDemand &&
      !businessClarity &&
      !workflowProblem &&
      !toolLike &&
      !apiOrSaasLike;
    const reusableIdea =
      clearDemand &&
      (easyToCopy || crowded || platformDependent || legalRisk || toolLike);
    const counterQuestionsResolved =
      projectReality.hasRealUser &&
      (chargePotential || Boolean(monetization)) &&
      (clearDemand || workflowProblem || Boolean(problem));
    const anchorMatch = this.compareWithAnchors({
      projectReality,
      clearDemand,
      chargePotential,
      scamLike,
      templateLike,
      showcaseLike,
      demoLike,
      automationLike,
      apiOrSaasLike,
      toolLike,
    });

    let positiveScore = 0;
    let negativeScore = 0;

    if (promising) {
      positiveScore += 1;
    }
    if (clearDemand) {
      positiveScore += 2;
    }
    if (businessClarity) {
      positiveScore += 2;
    }
    if (workflowProblem) {
      positiveScore += 2;
    }
    if (apiOrSaasLike) {
      positiveScore += 1;
    }
    if (automationLike) {
      positiveScore += 1;
    }
    if (chargePotential) {
      positiveScore += 1;
    }
    if (canQuicklyShip) {
      positiveScore += 1;
    }
    if (toolLike) {
      positiveScore += 1;
    }
    if (smallTeamFriendly) {
      positiveScore += 1;
    }
    if (repository.roughPass) {
      positiveScore += 1;
    }
    if (repository.decision === RepositoryDecision.RECOMMENDED) {
      positiveScore += 1;
    }
    if (repository.opportunityLevel === RepositoryOpportunityLevel.HIGH) {
      positiveScore += 1;
    }

    if (typeof ideaFitScore === 'number') {
      if (ideaFitScore >= 80) {
        positiveScore += 2;
      } else if (ideaFitScore >= 68) {
        positiveScore += 1;
      } else if (ideaFitScore < 40) {
        negativeScore += 2;
      } else if (ideaFitScore < 55) {
        negativeScore += 1;
      }
    }

    if (completenessLevel === RepositoryCompletenessLevel.HIGH) {
      positiveScore += 1;
    } else if (completenessLevel === RepositoryCompletenessLevel.LOW) {
      negativeScore += 1;
    }

    if (snapshot?.isPromising === false) {
      negativeScore += 2;
    }
    if (snapshotSkip) {
      negativeScore += 2;
    }
    if (templateLike || showcaseLike) {
      negativeScore += 3;
    } else if (demoLike) {
      negativeScore += 2;
    }
    if (crowded) {
      negativeScore += 1;
    }
    if (legalRisk) {
      negativeScore += 2;
    }
    if (platformDependent) {
      negativeScore += 1;
    }
    if (maintenanceWeak) {
      negativeScore += 1;
    }
    if (repository.decision === RepositoryDecision.REJECTED) {
      negativeScore += 2;
    }
    if (scamLike) {
      negativeScore += 4;
    }
    if (weakProductDirection) {
      negativeScore += 2;
    }

    const confidence = this.computeInsightConfidence({
      projectReality,
      anchorMatch,
      ideaFitScore,
      completenessLevel,
      clearDemand,
      chargePotential,
      toolLike,
      automationLike,
      apiOrSaasLike,
      counterQuestionsResolved,
      negativeScore,
      templateLike,
      capabilityLeakage:
        projectReality.type === 'model' ||
        projectReality.type === 'infra' ||
        /(proxy|gateway|router|provider|framework|sdk|library|mcp server|fallback layer)/i.test(
          haystack,
        ),
      genericOneLiner: this.isGenericOneLiner(
        this.cleanText(snapshot?.oneLinerZh, 120),
      ),
      fallbackGap:
        (trainingKnowledge?.fallbackLearning.gapCount ?? 0) > 0 &&
        this.readCurrentFallbackGap(repository.analysis?.claudeReviewJson),
      trainingKnowledge,
    });

    return {
      ideaFitScore,
      projectReality,
      promising,
      clearDemand,
      businessClarity,
      canQuicklyShip,
      easyToCopy,
      toolLike,
      apiOrSaasLike,
      automationLike,
      workflowProblem,
      chargePotential,
      smallTeamFriendly,
      reusableIdea,
      demoLike,
      templateLike,
      showcaseLike,
      scamLike,
      legalRisk,
      platformDependent,
      maintenanceWeak,
      weakProductDirection,
      crowded,
      severeRisk:
        scamLike ||
        (legalRisk && !snapshotPromising && !repository.roughPass) ||
        ((templateLike || showcaseLike) && !clearDemand),
      lowBarrier,
      missingAnalysis,
      confidence,
      anchorMatch,
      counterQuestionsResolved,
      positiveScore,
      negativeScore,
    };
  }

  private compareWithAnchors(input: {
    projectReality: ProjectReality;
    clearDemand: boolean;
    chargePotential: boolean;
    scamLike: boolean;
    templateLike: boolean;
    showcaseLike: boolean;
    demoLike: boolean;
    automationLike: boolean;
    apiOrSaasLike: boolean;
    toolLike: boolean;
  }): InsightAnchorMatch {
    if (input.scamLike) {
      return 'BAD';
    }

    if (
      input.projectReality.type === 'model' ||
      input.projectReality.type === 'infra' ||
      input.projectReality.type === 'demo' ||
      input.templateLike ||
      input.showcaseLike ||
      input.demoLike
    ) {
      return 'CLONE';
    }

    if (
      (input.projectReality.type === 'product' ||
        input.projectReality.type === 'tool') &&
      input.projectReality.hasRealUser &&
      input.projectReality.hasClearUseCase &&
      input.projectReality.isDirectlyMonetizable &&
      input.clearDemand &&
      input.chargePotential &&
      (input.automationLike || input.apiOrSaasLike || input.toolLike)
    ) {
      return 'GOOD';
    }

    return 'CLONE';
  }

  private computeInsightConfidence(input: {
    projectReality: ProjectReality;
    anchorMatch: InsightAnchorMatch;
    ideaFitScore: number | null;
    completenessLevel: RepositoryCompletenessLevel;
    clearDemand: boolean;
    chargePotential: boolean;
    toolLike: boolean;
    automationLike: boolean;
    apiOrSaasLike: boolean;
    counterQuestionsResolved: boolean;
    negativeScore: number;
    templateLike: boolean;
    capabilityLeakage: boolean;
    genericOneLiner: boolean;
    fallbackGap: boolean;
    trainingKnowledge: AnalysisTrainingKnowledge | null;
  }) {
    let score = 0.35;

    if (input.projectReality.type === 'product' || input.projectReality.type === 'tool') {
      score += 0.12;
    }
    if (input.projectReality.hasRealUser) {
      score += 0.1;
    }
    if (input.projectReality.hasClearUseCase) {
      score += 0.1;
    }
    if (input.projectReality.isDirectlyMonetizable) {
      score += 0.1;
    }
    if (input.clearDemand) {
      score += 0.08;
    }
    if (input.chargePotential) {
      score += 0.07;
    }
    if (input.toolLike || input.automationLike || input.apiOrSaasLike) {
      score += 0.05;
    }
    if (input.counterQuestionsResolved) {
      score += 0.08;
    }
    if (input.anchorMatch === 'GOOD') {
      score += 0.08;
    } else if (input.anchorMatch === 'BAD') {
      score -= 0.2;
    } else {
      score -= 0.05;
    }

    if (typeof input.ideaFitScore === 'number') {
      if (input.ideaFitScore >= 80) {
        score += 0.08;
      } else if (input.ideaFitScore >= 68) {
        score += 0.04;
      } else if (input.ideaFitScore < 55) {
        score -= 0.08;
      }
    }

    if (input.completenessLevel === RepositoryCompletenessLevel.HIGH) {
      score += 0.04;
    } else if (input.completenessLevel === RepositoryCompletenessLevel.LOW) {
      score -= 0.06;
    }

    score -= Math.min(0.25, input.negativeScore * 0.02);

    const calibration =
      input.trainingKnowledge?.confidenceCalibration ?? null;
    if (calibration) {
      score -= calibration.globalPenalty;
      score -=
        calibration.projectTypePenalties[input.projectReality.type] ?? 0;

      if (input.templateLike) {
        score -= calibration.signalPenalties.templateLike;
      }

      if (input.capabilityLeakage) {
        score -= calibration.signalPenalties.capabilityLeakage;
      }

      if (input.genericOneLiner) {
        score -= calibration.signalPenalties.genericOneLiner;
      }

      if (input.fallbackGap) {
        score -= calibration.signalPenalties.fallbackGap;
      }
    }

    return Math.max(0, Math.min(1, Number(score.toFixed(3))));
  }

  private resolveRealityCheckedOneLiner(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
    extractedIdea: Record<string, unknown> | null,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
    projectReality: ProjectReality,
  ) {
    const haystack = [
      repository.name,
      repository.description,
      snapshot?.oneLinerZh,
      extractedIdea?.ideaSummary,
      extractedIdea?.problem,
      extractedIdea?.solution,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (projectReality.type === 'demo') {
      return '一个用于展示技术能力的示例项目';
    }

    if (projectReality.type === 'model') {
      if (/(multimodal|vision-language|vlm|image understanding|image generation)/i.test(haystack)) {
        return '围绕图像与文本处理的多模态模型方向';
      }

      if (/(rag|retrieval|search model|embedding)/i.test(haystack)) {
        return '围绕检索与理解能力的模型方向';
      }

      return '围绕特定能力场景的模型方向';
    }

    if (projectReality.type === 'infra') {
      if (/(mcp|agent framework|runtime|orchestration framework)/i.test(haystack)) {
        return '围绕 AI 与自动化系统的底层框架方向';
      }

      if (/(gateway|proxy|auth|storage|security|observability)/i.test(haystack)) {
        return '围绕底层能力封装的基础设施方向';
      }

      return '围绕底层能力封装的基础设施方向';
    }

    return '';
  }

  private ensureSpecificOneLiner(
    value: string,
    repository: RepositoryInsightTarget,
    extractedIdea: Record<string, unknown> | null,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
    projectReality: ProjectReality,
  ) {
    const normalized = this.cleanText(value, 120);
    const hasResolvedUserAndUseCase =
      projectReality.hasRealUser && projectReality.hasClearUseCase;

    if (!hasResolvedUserAndUseCase) {
      if (
        /一个帮.+的(?:工具|平台|系统|服务)/.test(normalized) ||
        /(提效|提升效率|自动跑流程|快速搭应用|工程工具|AI 工具)/i.test(normalized)
      ) {
        const conservativeCategory =
          CATEGORY_LABELS[category.sub] ?? CATEGORY_LABELS[category.main] ?? '当前场景';

        return this.limitReadableLine(`围绕${conservativeCategory}方向的样本`, 30);
      }
    }

    if (
      !normalized ||
      !/(帮[^的]{1,20}(开发者|团队|企业|运营|商家|内容团队|工程团队|用户)|给[^的]{1,20}(开发者|团队|企业|用户)|用于|面向|服务)/.test(
        normalized,
      )
    ) {
      const targetUsers = this.readStringArray(extractedIdea?.targetUsers);
      const primaryTarget = this.normalizeTargetUser(targetUsers[0]);
      const action = this.inferPrimaryUseCase(repository, extractedIdea, category);

      if (
        (projectReality.type === 'product' || projectReality.type === 'tool') &&
        hasResolvedUserAndUseCase
      ) {
        if (primaryTarget && action) {
          return `一个帮${primaryTarget}${action}的工具`;
        }

        if (primaryTarget) {
          return `一个服务${primaryTarget}的${CATEGORY_LABELS[category.sub] ?? '工具'}`;
        }
      }
    }

    return normalized;
  }

  private humanizeOneLiner(
    source: string,
    repository: RepositoryInsightTarget,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
  ) {
    const normalized = this.cleanText(source, 180);
    const haystack = `${normalized} ${this.buildKeywordHaystack(repository)}`;
    const templated = this.resolveOneLinerTemplate(haystack, category);

    if (templated) {
      return templated;
    }

    if (/[\u4e00-\u9fff]/.test(normalized)) {
      const humanized = this.normalizeChineseOneLiner(normalized);
      if (humanized) {
        return humanized;
      }
    }

    return '';
  }

  private hasConcreteUseCaseLine(value: string) {
    const normalized = this.cleanText(value, 180).toLowerCase();

    if (!normalized || normalized.length < 12) {
      return false;
    }

    if (
      /(帮用户提效|帮团队提效|一个围绕|一个服务|一个工具|一个平台|一个项目|小工具|能力封装|技术展示)/i.test(
        normalized,
      )
    ) {
      return false;
    }

    return /(帮|让|用于|用来|给|for |to |帮助|管理|采集|同步|部署|监控|搜索|登录|权限|流程|自动|工作流|浏览器|命令行|数据|文档|知识|客服|销售|协作)/i.test(
      normalized,
    );
  }

  private normalizeTargetUser(value: string | undefined) {
    const normalized = this.cleanText(value, 40).toLowerCase();

    if (!normalized) {
      return '';
    }

    if (/(developer|engineering|engineer|研发|开发)/i.test(normalized)) {
      return '开发者';
    }
    if (/(team|teams|团队)/i.test(normalized)) {
      return '团队';
    }
    if (/(business|company|enterprise|企业|商家)/i.test(normalized)) {
      return '企业';
    }
    if (/(marketer|marketing|运营)/i.test(normalized)) {
      return '运营团队';
    }
    if (/(designer|design)/i.test(normalized)) {
      return '设计团队';
    }

    return this.limitReadableLine(value ?? '', 12);
  }

  private inferPrimaryUseCase(
    repository: RepositoryInsightTarget,
    extractedIdea: Record<string, unknown> | null,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
  ) {
    const haystack = [
      repository.description,
      extractedIdea?.problem,
      extractedIdea?.solution,
      extractedIdea?.ideaSummary,
      repository.name,
      ...(repository.topics ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/(pr review|code review|review comment)/i.test(haystack)) {
      return '自动生成 PR review';
    }
    if (/(workflow|automation|orchestration)/i.test(haystack)) {
      return '自动处理工作流';
    }
    if (/(search api|search|retrieval)/i.test(haystack)) {
      return '提供搜索接口';
    }
    if (/(deploy|release|delivery)/i.test(haystack)) {
      return '管理部署与交付';
    }
    if (/(monitor|alert|observability)/i.test(haystack)) {
      return '监控系统运行状态';
    }
    if (/(auth|identity|sso|permission)/i.test(haystack)) {
      return '管理登录与权限';
    }
    if (/(scrap|crawl|extract data|采集)/i.test(haystack)) {
      return '采集结构化数据';
    }
    if (/(knowledge|doc|note|card|memory|document)/i.test(haystack)) {
      return '整理知识和文档';
    }

    switch (category.sub) {
      case 'automation':
      case 'workflow':
        return '串联和执行多步流程';
      case 'devtools':
      case 'cli':
        return '在命令行里执行开发任务';
      case 'browser-extension':
        return '在浏览器里执行特定操作';
      case 'data-tools':
      case 'analytics':
      case 'etl':
        return '处理和分析数据';
      case 'auth':
        return '接入登录与权限能力';
      case 'deployment':
      case 'devops':
        return '部署和交付应用';
      default:
        return '';
    }
  }

  private resolveStructuredOneLiner(
    extractedIdea: Record<string, unknown> | null,
    repository: RepositoryInsightTarget,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
  ) {
    const focusedHaystack = [
      repository.name,
      repository.description,
      extractedIdea?.ideaSummary,
      extractedIdea?.problem,
      extractedIdea?.solution,
      ...(this.readStringArray(extractedIdea?.targetUsers) ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/(telegram)/i.test(focusedHaystack) && /(claude|llm|ai|assistant|bot)/i.test(focusedHaystack)) {
      return '一个把 AI 助手接入 Telegram 的机器人项目';
    }

    if (/(search api|serp|search aggregation|搜索接口|搜索引擎)/i.test(focusedHaystack)) {
      return '一个提供搜索接口的 API 服务';
    }

    if (/(arbitrage|uniswap|defi|mempool sniper|套利)/i.test(focusedHaystack)) {
      return '一个围绕加密套利策略的实验项目';
    }

    if (/(memory|context window|long-term memory|hippocampus|记忆|上下文)/i.test(focusedHaystack)) {
      return '一个用于管理 AI Agent 长期上下文的能力项目';
    }

    if (/(lawyer|deal lawyer|due diligence|boutique law|律师|法务|尽调|合同)/i.test(focusedHaystack)) {
      return '一个用于处理尽调与文档整理的法律辅助项目';
    }

    if (/(knowledge|card|note|notes|document|summary|知识卡片|文档整理|笔记)/i.test(focusedHaystack)) {
      return '一个用于整理长文档和知识卡片的代码项目';
    }

    return this.resolveOneLinerTemplate(focusedHaystack, category);
  }

  private fallbackOneLiner(
    repository: RepositoryInsightTarget,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
  ) {
    return (
      this.resolveOneLinerTemplate(this.buildKeywordHaystack(repository), category) ||
      `围绕${CATEGORY_LABELS[category.sub] ?? CATEGORY_LABELS[category.main] ?? '当前技术方向'}方向的实现项目`
    );
  }

  private resolveOneLinerTemplate(
    haystack: string,
    category: {
      main: IdeaMainCategory;
      sub: IdeaSubCategory;
    },
  ) {
    const normalized = haystack.toLowerCase();

    if (
      /(agentic ide|agent swarm|multi-agent|multi agent|code editor|claude code|codex|opencode|developer tools)/i.test(
        normalized,
      )
    ) {
      return '一个围绕多代理编码流程的工程工具方向';
    }

    if (/(telegram)/i.test(normalized) && /(claude|llm|ai|assistant|bot)/i.test(normalized)) {
      return '一个把 AI 助手接入 Telegram 的机器人项目';
    }

    if (/(search api|serp|search aggregation|搜索接口|搜索引擎)/i.test(normalized)) {
      return '一个提供搜索接口的 API 服务';
    }

    if (/(arbitrage|uniswap|defi|mempool sniper|套利)/i.test(normalized)) {
      return '一个围绕加密套利策略的实验项目';
    }

    if (/(browser extension|chrome extension|firefox extension)/i.test(normalized)) {
      return '一个把特定能力装进浏览器的扩展';
    }

    if (/(workflow|automation|zapier|n8n|automate)/i.test(normalized)) {
      return '围绕自动化流程的工具方向';
    }

    if (/(productivity|copilot|workspace|knowledge worker|效率)/i.test(normalized)) {
      return '围绕效率场景的工具方向';
    }

    if (/(scraping|crawler|crawl|extract data|网页采集)/i.test(normalized)) {
      return '一个用于采集网页和结构化数据的代码项目';
    }

    if (/(dataset|etl|pipeline|analytics|data sync)/i.test(normalized)) {
      return '围绕数据处理与汇总的工具方向';
    }

    if (/(auth|authentication|login|identity|sso)/i.test(normalized)) {
      return '围绕登录与权限的能力方向';
    }

    if (/(deploy|deployment|docker|kubernetes|devops)/i.test(normalized)) {
      return '围绕部署与交付的工具方向';
    }

    if (/(monitor|observability|alert)/i.test(normalized)) {
      return '一个用于监控系统运行状态的可观测组件';
    }

    switch (category.sub) {
      case 'ai-tools':
        return '围绕特定 AI 使用场景的工具方向';
      case 'automation':
        return '围绕自动化流程的工具方向';
      case 'browser-extension':
        return '一个把特定能力装进浏览器的扩展';
      case 'productivity':
        return '围绕效率场景的工具方向';
      case 'workflow':
        return '围绕多步工作流编排的工具方向';
      case 'cli':
        return '围绕命令行工作流的开发工具方向';
      case 'no-code':
        return '围绕少代码流程搭建的项目方向';
      case 'ops-tools':
        return '围绕运维流程处理的工具方向';
      case 'devtools':
        return '围绕开发流程的工程工具方向';
      case 'data-tools':
        return '围绕数据处理与分析的工具方向';
      case 'ai-writing':
        return '围绕内容生成与改写的 AI 工具方向';
      case 'ai-code':
        return '围绕代码生成与协作的 AI 工具方向';
      case 'ai-agent':
        return '围绕任务拆解与执行的 AI agent 方向';
      case 'ai-image':
        return '围绕图片生成的 AI 工具方向';
      case 'ai-search':
        return '一个提供搜索接口的 API 服务';
      case 'marketplace':
        return '围绕供需撮合的垂直平台方向';
      case 'app-builder':
        return '围绕应用搭建的项目方向';
      case 'workflow-platform':
        return '围绕多步任务编排的平台方向';
      case 'developer-platform':
        return '围绕开发者协作与交付的平台方向';
      case 'api-platform':
        return '围绕能力封装输出的 API 平台方向';
      case 'data-pipeline':
        return '围绕多源数据汇总与处理的服务方向';
      case 'analytics':
        return '围绕数据变化分析的工具方向';
      case 'scraping':
        return '一个用于采集网页和结构化数据的代码项目';
      case 'etl':
        return '围绕数据清洗与同步的工具方向';
      case 'dataset':
        return '围绕结构化数据能力的数据服务方向';
      case 'data-observability':
        return '围绕数据问题定位的工具方向';
      case 'deployment':
        return '围绕部署与上线的工具方向';
      case 'observability':
        return '一个用于监控系统运行状态的可观测组件';
      case 'auth':
        return '围绕登录与权限接入的能力方向';
      case 'storage':
        return '围绕数据存储托管的能力方向';
      case 'api-gateway':
        return '一个帮团队统一管理 API 流量和接入的网关';
      case 'devops':
        return '一个帮工程团队提升交付效率的工具';
      case 'cloud':
        return '一个服务云环境管理和交付的平台';
      case 'monitoring':
        return '一个帮团队盯运行状态的监控工具';
      case 'security':
        return '一个帮团队补安全能力的工具';
      case 'content-creation':
        return '一个帮团队生成内容素材的工具';
      case 'seo':
        return '一个帮团队做内容分发和 SEO 的工具';
      case 'publishing':
        return '一个帮内容团队发布和分发内容的平台';
      case 'media':
        return '一个帮团队处理音视频内容的工具';
      case 'game-tooling':
        return '一个服务游戏开发流程的工具';
      case 'game-content':
        return '一个面向游戏内容生产的工具';
      case 'game-platform':
        return '一个连接玩家和内容的游戏平台';
      case 'other':
      default:
        return '';
    }
  }

  private normalizeChineseOneLiner(value: string) {
    let normalized = this.cleanText(value, 120).replace(/[。.!！?？]+$/g, '');

    normalized = normalized
      .replace(/^基于[^，。,；;]{1,18}(的)?/, '')
      .replace(/^面向/, '')
      .replace(/^用于/, '用来')
      .replace(/^帮助/, '帮')
      .replace(/^支持/, '支持')
      .trim();

    if (!normalized) {
      return '';
    }

    if (!normalized.startsWith('一个') && !normalized.startsWith('帮')) {
      if (/(工具|平台|插件|服务|接口|系统|助手|机器人|引擎|应用|扩展)/.test(normalized)) {
        normalized = `一个${normalized}`;
      }
    }

    if (normalized.startsWith('帮')) {
      normalized = `一个${normalized}`;
    }

    return this.limitReadableLine(normalized, 30);
  }

  private isGenericOneLiner(value: string) {
    const normalized = this.cleanText(value, 120).toLowerCase();
    if (!normalized) {
      return true;
    }

    return (
      normalized.length < 10 ||
      /(一个工具|一个项目|工具项目|开源工具|提效工具|效率工具|帮助用户提效)/i.test(
        normalized,
      )
    );
  }

  private readCurrentFallbackGap(value: Prisma.JsonValue | null | undefined) {
    const review = this.readObject(value);
    const fallbackDiff = this.readObject(
      review?.fallbackDiff as Prisma.JsonValue | undefined,
    );
    return Boolean(fallbackDiff?.changed);
  }

  private detectCategoryMain(repository: RepositoryInsightTarget): IdeaMainCategory {
    const haystack = this.buildKeywordHaystack(repository);

    if (
      /(extension|browser|plugin|cli|sdk|workflow|automation|productivity|no-code|low-code|integration|dashboard|devtool|developer tool|tooling|ops tool|command line)/i.test(
        haystack,
      )
    ) {
      return 'tools';
    }

    if (/(dataset|analytics|data|etl|pipeline|scraping|crawler|data sync)/i.test(haystack)) {
      return 'data';
    }

    if (
      /(infra|cloud|devops|kubernetes|docker|security|monitor|observability|auth|storage|gateway|deploy)/i.test(
        haystack,
      )
    ) {
      return 'infra';
    }

    if (/(gpt|llm|agent|copilot|openai|claude|rag|ai)/i.test(haystack)) {
      return 'ai';
    }

    if (/(content|seo|media|publish)/i.test(haystack)) {
      return 'content';
    }

    if (/(marketplace|platform|builder|workflow)/i.test(haystack)) {
      return 'platform';
    }

    if (/(game|gaming)/i.test(haystack)) {
      return 'game';
    }

    if (/(tool|extension|plugin|cli|sdk|api|automation|developer)/i.test(haystack)) {
      return 'tools';
    }

    return 'other';
  }

  private detectCategorySub(
    repository: RepositoryInsightTarget,
    mainCategory: IdeaMainCategory,
  ) {
    const haystack = this.buildKeywordHaystack(repository);

    switch (mainCategory) {
      case 'tools':
        if (/(extension|chrome|browser)/i.test(haystack)) {
          return 'browser-extension';
        }
        if (/(cli|command line|terminal)/i.test(haystack)) {
          return 'cli';
        }
        if (/(productivity|workspace|efficiency|knowledge worker)/i.test(haystack)) {
          return 'productivity';
        }
        if (/(workflow|orchestration|pipeline builder|integration flow)/i.test(haystack)) {
          return 'workflow';
        }
        if (/(no-code|low-code|visual builder)/i.test(haystack)) {
          return 'no-code';
        }
        if (/(ops|runbook|incident|sre)/i.test(haystack)) {
          return 'ops-tools';
        }
        if (/(automation|workflow|zapier|n8n)/i.test(haystack)) {
          return 'automation';
        }
        if (/(data|analytics|sql)/i.test(haystack)) {
          return 'data-tools';
        }
        if (/(ai|llm|agent|copilot)/i.test(haystack)) {
          return 'ai-tools';
        }
        return 'devtools';
      case 'platform':
        if (/(marketplace)/i.test(haystack)) {
          return 'marketplace';
        }
        if (/(builder|no-code|low-code)/i.test(haystack)) {
          return 'app-builder';
        }
        if (/(api)/i.test(haystack)) {
          return 'api-platform';
        }
        if (/(developer)/i.test(haystack)) {
          return 'developer-platform';
        }
        return 'workflow-platform';
      case 'ai':
        if (/(code|coding|developer)/i.test(haystack)) {
          return 'ai-code';
        }
        if (/(image|video|photo)/i.test(haystack)) {
          return 'ai-image';
        }
        if (/(search|retrieval)/i.test(haystack)) {
          return 'ai-search';
        }
        if (/(write|writing|content)/i.test(haystack)) {
          return 'ai-writing';
        }
        return 'ai-agent';
      case 'data':
        if (/(pipeline|etl)/i.test(haystack)) {
          return 'data-pipeline';
        }
        if (/(scrap|crawl|extract)/i.test(haystack)) {
          return 'scraping';
        }
        if (/(warehouse|transform|dbt|elt)/i.test(haystack)) {
          return 'etl';
        }
        if (/(observability|monitor)/i.test(haystack)) {
          return 'data-observability';
        }
        if (/(dataset)/i.test(haystack)) {
          return 'dataset';
        }
        return 'analytics';
      case 'infra':
        if (/(deploy|deployment)/i.test(haystack)) {
          return 'deployment';
        }
        if (/(observability|trace|logging|metrics|alert)/i.test(haystack)) {
          return 'observability';
        }
        if (/(auth|authentication|identity|sso|oauth)/i.test(haystack)) {
          return 'auth';
        }
        if (/(storage|blob|bucket|filesystem|object store)/i.test(haystack)) {
          return 'storage';
        }
        if (/(gateway|api gateway|proxy|ingress)/i.test(haystack)) {
          return 'api-gateway';
        }
        if (/(cloud)/i.test(haystack)) {
          return 'cloud';
        }
        if (/(monitor)/i.test(haystack)) {
          return 'monitoring';
        }
        if (/(security|auth)/i.test(haystack)) {
          return 'security';
        }
        return 'devops';
      case 'content':
        if (/(seo)/i.test(haystack)) {
          return 'seo';
        }
        if (/(publish|cms|newsletter)/i.test(haystack)) {
          return 'publishing';
        }
        if (/(media|audio|video)/i.test(haystack)) {
          return 'media';
        }
        return 'content-creation';
      case 'game':
        if (/(platform)/i.test(haystack)) {
          return 'game-platform';
        }
        if (/(asset|content)/i.test(haystack)) {
          return 'game-content';
        }
        return 'game-tooling';
      case 'other':
      default:
        return 'other';
    }
  }

  private buildKeywordHaystack(repository: RepositoryInsightTarget) {
    return [
      repository.name,
      repository.fullName,
      repository.description,
      repository.homepage,
      repository.language,
      ...(repository.topics ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private buildInsightHaystack(
    repository: RepositoryInsightTarget,
    snapshot: Record<string, unknown> | null,
    completeness: Record<string, unknown> | null,
    ideaFit: Record<string, unknown> | null,
    extractedIdea: Record<string, unknown> | null,
  ) {
    return [
      this.buildKeywordHaystack(repository),
      snapshot?.oneLinerZh,
      snapshot?.reason,
      extractedIdea?.ideaSummary,
      extractedIdea?.problem,
      extractedIdea?.solution,
      extractedIdea?.whyNow,
      extractedIdea?.differentiation,
      extractedIdea?.monetization,
      completeness?.summary,
      ideaFit?.coreJudgement,
      ...this.readStringArray(extractedIdea?.risks),
      ...this.readStringArray(ideaFit?.negativeFlags),
      ...this.readStringArray(ideaFit?.opportunityTags),
      ...this.readStringArray(extractedIdea?.targetUsers),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private hasMissingAnalysis(
    analysis: RepositoryInsightTarget['analysis'] | null | undefined,
  ) {
    return !analysis?.completenessJson || !analysis?.ideaFitJson || !analysis?.extractedIdeaJson;
  }

  private isRecentlyCreated(createdAtGithub?: Date | null) {
    if (!createdAtGithub) {
      return false;
    }

    return Date.now() - createdAtGithub.getTime() <= 30 * 24 * 60 * 60 * 1000;
  }

  private ensureChineseStyle(value: string) {
    const normalized = this.cleanText(value, 140);

    if (!normalized) {
      return '';
    }

    if (/[\u4e00-\u9fff]/.test(normalized)) {
      return this.ensureSentence(normalized);
    }

    return this.ensureSentence(`这个项目主要在做：${normalized}`);
  }

  private ensureSentence(value: string) {
    const normalized = value.trim();

    if (!normalized) {
      return '';
    }

    if (/[\u3002.!?]$/.test(normalized)) {
      return normalized;
    }

    if (/[\u4e00-\u9fff]/.test(normalized)) {
      return `${normalized}。`;
    }

    return normalized;
  }

  private limitReadableLine(value: string, maxLength: number) {
    const normalized = value.trim().replace(/\s+/g, ' ');

    if (normalized.length <= maxLength) {
      return normalized;
    }

    const sliced = normalized.slice(0, maxLength).trim();
    const punctuationBoundary = Math.max(
      sliced.lastIndexOf('，'),
      sliced.lastIndexOf(','),
      sliced.lastIndexOf('、'),
      sliced.lastIndexOf('；'),
      sliced.lastIndexOf(';'),
    );

    if (punctuationBoundary >= Math.floor(maxLength * 0.5)) {
      return sliced.slice(0, punctuationBoundary).trim();
    }

    return sliced;
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');

    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    const sliced = normalized.slice(0, maxLength).trim();
    const lastWordBoundary = sliced.lastIndexOf(' ');

    if (lastWordBoundary >= Math.floor(maxLength * 0.6)) {
      return sliced.slice(0, lastWordBoundary).trim();
    }

    return sliced;
  }

  private readObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readNumber(value: unknown) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.cleanText(item, 160))
      .filter(Boolean);
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (value && typeof value === 'object' && 'toNumber' in value) {
      return (value as Prisma.Decimal).toNumber();
    }

    return null;
  }

  private async mergeBehaviorContext(
    context?: UserBehaviorContext,
  ): Promise<UserBehaviorContext> {
    const memoryInput = await this.behaviorMemoryService.getModelInput();

    return {
      userSuccessPatterns:
        context?.userSuccessPatterns?.length
          ? context.userSuccessPatterns
          : memoryInput.userSuccessPatterns,
      userFailurePatterns:
        context?.userFailurePatterns?.length
          ? context.userFailurePatterns
          : memoryInput.userFailurePatterns,
      preferredCategories:
        context?.preferredCategories?.length
          ? context.preferredCategories
          : memoryInput.preferredCategories,
      avoidedCategories:
        context?.avoidedCategories?.length
          ? context.avoidedCategories
          : memoryInput.avoidedCategories,
      recentValidatedWins:
        context?.recentValidatedWins?.length
          ? context.recentValidatedWins
          : memoryInput.recentValidatedWins,
      recentDroppedReasons:
        context?.recentDroppedReasons?.length
          ? context.recentDroppedReasons
          : memoryInput.recentDroppedReasons,
      userSuccessReasons:
        context?.userSuccessReasons?.length
          ? context.userSuccessReasons
          : memoryInput.userSuccessReasons,
      userFailureReasons:
        context?.userFailureReasons?.length
          ? context.userFailureReasons
          : memoryInput.userFailureReasons,
      minEvidenceThreshold:
        typeof context?.minEvidenceThreshold === 'number'
          ? context.minEvidenceThreshold
          : memoryInput.minEvidenceThreshold,
      failureWeightDecay:
        typeof context?.failureWeightDecay === 'number'
          ? context.failureWeightDecay
          : memoryInput.failureWeightDecay,
    };
  }
}
