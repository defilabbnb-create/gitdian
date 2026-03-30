import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RadarDailySummaryService } from './radar-daily-summary.service';
import { TelegramNotifierService } from './telegram-notifier.service';
import {
  IdeaMainCategory,
  normalizeIdeaMainCategory,
} from '../analysis/idea-snapshot-taxonomy';

type DailyReportSendSource = 'manual' | 'scheduler';

type DailySummaryCategory = {
  main: IdeaMainCategory;
  sub: string;
};

type DailyReportSummaryItem = {
  repositoryId: string;
  fullName: string;
  oneLinerZh: string;
  verdict: 'GOOD' | 'OK' | 'BAD';
  action: 'BUILD' | 'CLONE' | 'IGNORE';
  category: DailySummaryCategory;
  moneyPriorityLabelZh: string;
  moneyPriorityReasonZh: string;
  moneyDecisionLabelZh?: string;
  recommendedMoveZh: string;
  decisionSummary?: {
    headlineZh: string;
    judgementLabelZh: string;
    verdictLabelZh: string;
    actionLabelZh: string;
    finalDecisionLabelZh: string;
    moneyPriorityLabelZh: string;
    categoryLabelZh: string;
    recommendedMoveZh: string;
    worthDoingLabelZh: string;
    reasonZh: string;
    targetUsersZh: string;
    monetizationSummaryZh: string;
    sourceLabelZh: string;
  } | null;
};

@Injectable()
export class RadarDailyReportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadarDailyReportService.name);
  private schedulerTimer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(
    private readonly radarDailySummaryService: RadarDailySummaryService,
    private readonly telegramNotifierService: TelegramNotifierService,
  ) {}

  async onModuleInit() {
    if (process.env.ENABLE_QUEUE_WORKERS !== 'true') {
      return;
    }

    this.startSchedulerLoop();
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async sendLatestSummary(options?: {
    force?: boolean;
    source?: DailyReportSendSource;
  }) {
    const force = options?.force === true;
    const source = options?.source ?? 'manual';
    const summary = await this.radarDailySummaryService.getLatestSummary();

    if (!summary) {
      return {
        status: 'skipped',
        reason: 'no_summary',
      } as const;
    }

    return this.sendSummary(summary.date, {
      force,
      source,
    });
  }

  async maybeSendScheduledSummary() {
    if (this.tickInFlight || !this.telegramNotifierService.isEnabled()) {
      return;
    }

    this.tickInFlight = true;

    try {
      const now = new Date();

      if (!this.isPastScheduledTime(now)) {
        return;
      }

      const todayKey = this.toDateKeyInTimezone(
        now,
        this.resolveTimezone(),
      );
      const summary = await this.radarDailySummaryService.getSummaryByDate(todayKey);

      if (!summary) {
        return;
      }

      await this.sendSummary(summary.date, {
        force: false,
        source: 'scheduler',
      });
    } catch (error) {
      this.logger.warn(
        `Telegram daily report scheduler tick failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      this.tickInFlight = false;
    }
  }

  private startSchedulerLoop() {
    if (this.schedulerTimer || !this.telegramNotifierService.isEnabled()) {
      return;
    }

    this.schedulerTimer = setInterval(() => {
      void this.maybeSendScheduledSummary();
    }, 60_000);

    void this.maybeSendScheduledSummary();
  }

  private async sendSummary(
    date: string,
    options: {
      force: boolean;
      source: DailyReportSendSource;
    },
  ) {
    const summary = await this.radarDailySummaryService.getSummaryByDate(date);

    if (!summary) {
      return {
        status: 'skipped',
        reason: 'summary_not_found',
        date,
      } as const;
    }

    if (!options.force && summary.telegramSendStatus === 'SENT') {
      return {
        status: 'already_sent',
        date,
        sentAt: summary.telegramSentAt,
        messageId: summary.telegramMessageId,
      } as const;
    }

    if (!this.telegramNotifierService.isConfigured()) {
      await this.radarDailySummaryService.markTelegramSendFailure({
        date,
        error: 'Telegram notifier is not configured.',
        status: 'SKIPPED',
      });

      return {
        status: 'skipped',
        reason: 'telegram_not_configured',
        date,
      } as const;
    }

    const preparedSummary = await this.prepareSummaryForReport(summary);
    const text = this.buildDailyReportText(preparedSummary);

    try {
      const result = await this.telegramNotifierService.sendMessage(text);

      await this.radarDailySummaryService.markTelegramSendSuccess({
        date,
        messageId: result.messageId,
      });

      return {
        status: 'sent',
        source: options.source,
        date,
        messageId: result.messageId,
      } as const;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Telegram send error.';

      await this.radarDailySummaryService.markTelegramSendFailure({
        date,
        error: message,
        status: 'FAILED',
      });

      throw error;
    }
  }

  private buildDailyReportText(
    summary: Awaited<ReturnType<RadarDailySummaryService['getLatestSummary']>>,
  ) {
    if (!summary) {
      return 'Gitdian 创业机会日报\n暂无可发送摘要。';
    }

    const lines: string[] = [
      `Gitdian 今日最值得赚钱的项目 · ${summary.date}`,
      '',
      '今日概况',
      `- 新抓取项目：${summary.fetchedRepositories}`,
      `- Snapshot：${summary.snapshotGenerated}`,
      `- 深读：${summary.deepAnalyzed}`,
      `- 值得做：${summary.goodIdeas}`,
      `- 可以抄：${summary.cloneCandidates}`,
      `- 跳过：${summary.ignoredIdeas}`,
      '',
      '必做项目 Top 3',
    ];

    const topMustBuildItems = this.normalizeSummaryItems(summary.topMustBuildItems).slice(
      0,
      3,
    );
    const topHighValueItems = this.normalizeSummaryItems(summary.topHighValueItems).slice(
      0,
      5,
    );
    const topCloneItems = this.normalizeSummaryItems(summary.topCloneableItems).slice(
      0,
      5,
    );
    const topKeywordGroups = Array.isArray(summary.topKeywordGroups)
      ? summary.topKeywordGroups.slice(0, 3)
      : [];

    if (topMustBuildItems.length === 0) {
      lines.push('1. 今日还没有明确的必做项目');
    } else {
      topMustBuildItems.forEach((item, index) => {
        const summary = item.decisionSummary;
        lines.push(
          `${index + 1}. ${item.fullName}`,
          `一句话：${summary?.headlineZh || item.oneLinerZh}`,
          `挣钱优先级：${summary?.moneyPriorityLabelZh || item.moneyPriorityLabelZh}`,
          `结论：${summary?.finalDecisionLabelZh || `${this.verdictLabel(item.verdict)} · ${this.actionLabel(item.action)}`}`,
          `建议动作：${summary?.recommendedMoveZh || item.recommendedMoveZh}`,
          `分类：${summary?.categoryLabelZh || this.getCategoryDisplay(item.category).label}`,
          `原因：${summary?.reasonZh || item.moneyPriorityReasonZh}`,
          '',
        );
      });
    }

    lines.push('值得做 Top 5');

    if (topHighValueItems.length === 0) {
      lines.push('1. 今日还没有明确值得继续推进的项目');
    } else {
      topHighValueItems.forEach((item, index) => {
        const summary = item.decisionSummary;
        lines.push(
          `${index + 1}. ${item.fullName}`,
          `一句话：${summary?.headlineZh || item.oneLinerZh}`,
          `挣钱优先级：${summary?.moneyPriorityLabelZh || item.moneyPriorityLabelZh}`,
          `结论：${summary?.finalDecisionLabelZh || `${this.verdictLabel(item.verdict)} · ${this.actionLabel(item.action)}`}`,
          `建议动作：${summary?.recommendedMoveZh || item.recommendedMoveZh}`,
          `分类：${summary?.categoryLabelZh || this.getCategoryDisplay(item.category).label}`,
          `原因：${summary?.reasonZh || item.moneyPriorityReasonZh}`,
          '',
        );
      });
    }

    lines.push('值得抄 Top 5');

    if (topCloneItems.length === 0) {
      lines.push('1. 今日还没有明确可以抄的项目');
    } else {
      topCloneItems.forEach((item, index) => {
        const summary = item.decisionSummary;
        lines.push(
          `${index + 1}. ${item.fullName}`,
          `一句话：${summary?.headlineZh || item.oneLinerZh}`,
          `挣钱优先级：${summary?.moneyPriorityLabelZh || item.moneyPriorityLabelZh}`,
          `结论：${summary?.finalDecisionLabelZh || `${this.verdictLabel(item.verdict)} · ${this.actionLabel(item.action)}`}`,
          `建议动作：${summary?.recommendedMoveZh || item.recommendedMoveZh}`,
          `分类：${summary?.categoryLabelZh || this.getCategoryDisplay(item.category).label}`,
          `原因：${summary?.reasonZh || item.moneyPriorityReasonZh}`,
          '',
        );
      });
    }

    lines.push(
      '补充',
      `- 今日高风险 / 跳过项目：${summary.ignoredIdeas}`,
      ...this.buildAuditLines(summary),
      ...(topKeywordGroups.length
        ? [
            `- 今日高产关键词组：${topKeywordGroups
              .map((item) => item.group)
              .join(' / ')}`,
          ]
        : []),
      `- 详情页：${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').trim()}`,
    );

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  private buildAuditLines(
    summary: Awaited<ReturnType<RadarDailySummaryService['getLatestSummary']>>,
  ) {
    if (!summary?.latestClaudeAudit) {
      return [];
    }

    if (summary.latestClaudeAudit.severity !== 'HIGH') {
      return [];
    }

    const headline =
      summary.latestClaudeAudit.headline || summary.latestClaudeAudit.summary;
    if (!headline) {
      return [];
    }

    return [`- 今日系统判断偏差：${headline}`];
  }

  private normalizeSummaryItems(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as DailyReportSummaryItem[];
    }

    const items: DailyReportSummaryItem[] = [];
    value.forEach((item) => {
      const normalized = this.normalizeSummaryItem(item);
      if (normalized) {
        items.push(normalized);
      }
    });

    return items;
  }

  private normalizeSummaryItem(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const item = value as Record<string, unknown>;
    const category =
      item.category && typeof item.category === 'object' && !Array.isArray(item.category)
        ? (item.category as Record<string, unknown>)
        : {};
    const fullName = this.cleanText(item.fullName, 200);
    if (!fullName) {
      return null;
    }

    return {
      repositoryId: this.cleanText(item.repositoryId, 80),
      fullName,
      oneLinerZh: this.cleanText(item.oneLinerZh, 220),
      verdict: this.normalizeVerdict(item.verdict) ?? 'BAD',
      action: this.normalizeAction(item.action) ?? 'IGNORE',
      category: {
        main: normalizeIdeaMainCategory(category.main),
        sub: this.cleanText(category.sub, 80) || 'other',
      },
      moneyPriorityLabelZh: this.cleanText(item.moneyPriorityLabelZh, 60),
      moneyPriorityReasonZh: this.cleanText(item.moneyPriorityReasonZh, 260),
      moneyDecisionLabelZh: this.cleanText(item.moneyDecisionLabelZh, 60) || undefined,
      recommendedMoveZh: this.cleanText(item.recommendedMoveZh, 120),
      decisionSummary:
        item.decisionSummary &&
        typeof item.decisionSummary === 'object' &&
        !Array.isArray(item.decisionSummary)
          ? {
              headlineZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).headlineZh,
                220,
              ),
              judgementLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).judgementLabelZh,
                40,
              ),
              verdictLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).verdictLabelZh,
                40,
              ),
              actionLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).actionLabelZh,
                40,
              ),
              finalDecisionLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).finalDecisionLabelZh,
                80,
              ),
              moneyPriorityLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).moneyPriorityLabelZh,
                60,
              ),
              categoryLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).categoryLabelZh,
                100,
              ),
              recommendedMoveZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).recommendedMoveZh,
                120,
              ),
              worthDoingLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).worthDoingLabelZh,
                80,
              ),
              reasonZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).reasonZh,
                320,
              ),
              targetUsersZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).targetUsersZh,
                120,
              ),
              monetizationSummaryZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).monetizationSummaryZh,
                200,
              ),
              sourceLabelZh: this.cleanText(
                (item.decisionSummary as Record<string, unknown>).sourceLabelZh,
                40,
              ),
            }
          : null,
    } satisfies DailyReportSummaryItem;
  }

  private async prepareSummaryForReport(
    summary: Awaited<ReturnType<RadarDailySummaryService['getSummaryByDate']>>,
  ) {
    if (!summary) {
      return summary;
    }

    // Telegram summary delivery now depends only on the primary analysis pipeline.
    return summary;
  }

  private normalizeVerdict(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    return null;
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.length <= maxLength
      ? normalized
      : normalized.slice(0, maxLength);
  }

  private verdictLabel(value: string) {
    switch (value) {
      case 'GOOD':
        return '值得重点看';
      case 'OK':
        return '可继续看';
      case 'BAD':
      default:
        return '不建议投入';
    }
  }

  private actionLabel(value: string) {
    switch (value) {
      case 'BUILD':
        return '适合直接做';
      case 'CLONE':
        return '适合借鉴';
      case 'IGNORE':
      default:
        return '跳过';
    }
  }

  private getCategoryDisplay(category: DailySummaryCategory) {
    const main = normalizeIdeaMainCategory(category.main);
    const sub = String(category.sub ?? 'other').trim() || 'other';
    const mainLabels: Record<IdeaMainCategory, string> = {
      tools: '工具类',
      platform: '平台类',
      ai: 'AI应用',
      data: '数据服务',
      infra: '基础设施',
      content: '内容工具',
      game: '游戏',
      other: '其他',
    };
    const subLabels: Record<string, string> = {
      devtools: '开发工具',
      'ai-tools': 'AI工具',
      automation: '自动化工具',
      'data-tools': '数据工具',
      'browser-extension': '浏览器插件',
      productivity: '效率工具',
      workflow: '工作流工具',
      cli: 'CLI 工具',
      'no-code': '无代码工具',
      'ops-tools': '运维工具',
      marketplace: '平台市场',
      'app-builder': '应用搭建平台',
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
      scraping: '数据抓取',
      etl: 'ETL',
      dataset: '数据集',
      'data-observability': '数据可观测',
      deployment: '部署工具',
      observability: '可观测性',
      auth: '认证',
      storage: '存储',
      'api-gateway': 'API 网关',
      devops: 'DevOps',
      cloud: '云基础设施',
      monitoring: '监控',
      security: '安全',
      'content-creation': '内容创作',
      seo: 'SEO 工具',
      publishing: '发布工具',
      media: '媒体工具',
      'game-tooling': '游戏工具',
      'game-content': '游戏内容',
      'game-platform': '游戏平台',
      other: '其他',
    };

    return {
      mainLabel: mainLabels[main],
      subLabel: subLabels[sub] ?? '其他',
      label: `${mainLabels[main]} / ${subLabels[sub] ?? '其他'}`,
    };
  }

  private isPastScheduledTime(now: Date) {
    const timezone = this.resolveTimezone();
    const parts = this.getDateParts(now, timezone);
    const scheduledHour = this.readInt('DAILY_TELEGRAM_REPORT_HOUR', 21, 0, 23);
    const scheduledMinute = this.readInt(
      'DAILY_TELEGRAM_REPORT_MINUTE',
      0,
      0,
      59,
    );

    return (
      parts.hour > scheduledHour ||
      (parts.hour === scheduledHour && parts.minute >= scheduledMinute)
    );
  }

  private resolveTimezone() {
    return (
      process.env.DAILY_TELEGRAM_TIMEZONE?.trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'Asia/Shanghai'
    );
  }

  private toDateKeyInTimezone(value: Date, timezone: string) {
    const parts = this.getDateParts(value, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  private getDateParts(value: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(value);
    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
    };
  }

  private readInt(
    envName: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  private readPositiveInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
