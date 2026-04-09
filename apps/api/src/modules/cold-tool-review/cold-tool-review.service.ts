import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ColdToolReviewDecision,
  ColdToolReviewFlowStatus,
  ColdToolReviewRound,
  ColdToolReviewTaskStatus,
  Prisma,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ColdToolReviewQueueScope,
  ColdToolReviewReviewerQueryDto,
  QueryColdToolReviewQueueDto,
} from './dto/query-cold-tool-review.dto';
import { SubmitColdToolReviewDto } from './dto/submit-cold-tool-review.dto';

const REVIEW_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const ROUND_1_DECISIONS = new Set<ColdToolReviewDecision>([
  ColdToolReviewDecision.ROUND_1_KEEP,
  ColdToolReviewDecision.ROUND_1_PENDING,
  ColdToolReviewDecision.ROUND_1_REJECT,
]);

const ROUND_2_DECISIONS = new Set<ColdToolReviewDecision>([
  ColdToolReviewDecision.ROUND_2_STRONG_KEEP,
  ColdToolReviewDecision.ROUND_2_KEEP,
  ColdToolReviewDecision.ROUND_2_NEEDS_INFO,
  ColdToolReviewDecision.ROUND_2_REJECT,
]);

type ReviewTaskDetail = Prisma.ColdToolReviewTaskGetPayload<{
  include: {
    repository: {
      select: {
        id: true;
        name: true;
        fullName: true;
        htmlUrl: true;
        stars: true;
        description: true;
        categoryL1: true;
        categoryL2: true;
      };
    };
    analysis: {
      select: {
        id: true;
        analysisJson: true;
        ideaSnapshotJson: true;
        insightJson: true;
        extractedIdeaJson: true;
        analyzedAt: true;
        updatedAt: true;
      };
    };
    records: {
      orderBy: {
        createdAt: 'desc';
      };
    };
  };
}>;

@Injectable()
export class ColdToolReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getNext(query: ColdToolReviewReviewerQueryDto) {
    const reviewer = this.normalizeReviewer(query.reviewer);
    const round = query.round ?? ColdToolReviewRound.ROUND_1;
    const allocate = query.allocate === true;

    await this.ensureTaskPoolSynced();
    await this.releaseTimedOutLocks();

    const existing = await this.prisma.coldToolReviewTask.findFirst({
      where: {
        currentRound: round,
        taskStatus: ColdToolReviewTaskStatus.IN_PROGRESS,
        lockedBy: reviewer,
      },
      include: this.taskInclude(),
      orderBy: {
        lockedAt: 'desc',
      },
    });

    if (existing) {
      return {
        item: this.serializeTask(existing, reviewer),
        allocated: false,
      };
    }

    if (!allocate) {
      return {
        item: null,
        allocated: false,
      };
    }

    const candidates = await this.prisma.coldToolReviewTask.findMany({
      where: this.buildAssignableWhere(round),
      include: this.taskInclude(),
      take: 24,
      orderBy: [
        {
          lastSubmittedAt: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    const orderedCandidates = this.sortAssignmentCandidates(candidates, reviewer, round);

    for (const candidate of orderedCandidates) {
      const claimed = await this.prisma.coldToolReviewTask.updateMany({
        where: {
          id: candidate.id,
          currentRound: round,
          taskStatus: {
            in: [
              ColdToolReviewTaskStatus.PENDING,
              ColdToolReviewTaskStatus.RELEASED,
            ],
          },
        },
        data: {
          taskStatus: ColdToolReviewTaskStatus.IN_PROGRESS,
          lockedBy: reviewer,
          lockedAt: new Date(),
        },
      });

      if (!claimed.count) {
        continue;
      }

      const item = await this.prisma.coldToolReviewTask.findUnique({
        where: { id: candidate.id },
        include: this.taskInclude(),
      });

      if (!item) {
        break;
      }

      return {
        item: this.serializeTask(item, reviewer),
        allocated: true,
      };
    }

    return {
      item: null,
      allocated: false,
    };
  }

  async submit(body: SubmitColdToolReviewDto) {
    const reviewer = this.normalizeReviewer(body.reviewer);
    const round = body.round;
    const overrideExisting = body.overrideExisting === true;
    this.assertDecisionMatchesRound(round, body.decision);

    const reasonTags = this.cleanStringList(body.reasonTags);
    const disagreementTags = this.cleanStringList(body.disagreementTags);
    const note = this.cleanText(body.note, 1000);

    await this.ensureTaskPoolSynced();
    await this.releaseTimedOutLocks();

    const task = await this.prisma.coldToolReviewTask.findUnique({
      where: { id: body.taskId },
      include: this.taskInclude(),
    });

    if (!task) {
      throw new NotFoundException('Cold tool review task was not found.');
    }

    const existingRoundRecord = task.records.find((record) => record.round === round);

    if (task.currentRound !== round && !existingRoundRecord) {
      throw new ConflictException('Current task round does not match submit payload.');
    }

    if (existingRoundRecord) {
      if (!overrideExisting) {
        throw new ConflictException('This round has already been submitted.');
      }

      if (existingRoundRecord.reviewer !== reviewer) {
        throw new ConflictException('Only the original reviewer can override this round.');
      }

      if (this.hasLaterRoundRecord(task.records, round)) {
        throw new ConflictException(
          'A later round has already started, so this round can no longer be overridden.',
        );
      }
    } else if (
      task.taskStatus !== ColdToolReviewTaskStatus.IN_PROGRESS ||
      task.lockedBy !== reviewer
    ) {
      throw new ConflictException('Current task is not locked by this reviewer.');
    }

    const previousRoundRecord = this.findPreviousRoundRecord(task.records, round);
    const disagreementRequired =
      round === ColdToolReviewRound.ROUND_2 &&
      this.hasDecisionBucketDisagreement(previousRoundRecord?.decision, body.decision);
    const isDisputed =
      disagreementRequired || body.isDisputed === true || disagreementTags.length > 0;

    if (isDisputed && disagreementTags.length === 0 && !note) {
      throw new BadRequestException('标记分歧时必须提供分歧原因或备注。');
    }

    if (disagreementRequired && disagreementTags.length === 0 && !note) {
      throw new BadRequestException('第二轮与上一轮意见不同，必须填写分歧原因。');
    }

    const transition = this.resolveTaskTransition(body.decision);
    let updated: ReviewTaskDetail | null = null;

    try {
      updated = await this.prisma.$transaction(async (tx) => {
        if (existingRoundRecord) {
          await tx.coldToolReviewRecord.update({
            where: { id: existingRoundRecord.id },
            data: {
              decision: body.decision,
              reasonTags,
              disagreementTags,
              note,
              isDisputed,
            },
          });
        } else {
          await tx.coldToolReviewRecord.create({
            data: {
              taskId: task.id,
              analysisId: task.analysisId,
              repositoryId: task.repositoryId,
              round,
              reviewer,
              decision: body.decision,
              reasonTags,
              disagreementTags,
              note,
              isDisputed,
            },
          });
        }

        await tx.coldToolReviewTask.update({
          where: { id: task.id },
          data: {
            currentRound: transition.currentRound,
            taskStatus: transition.taskStatus,
            flowStatus: transition.flowStatus,
            lockedBy: null,
            lockedAt: null,
            lastSubmittedAt: new Date(),
          },
        });

        return tx.coldToolReviewTask.findUnique({
          where: { id: task.id },
          include: this.taskInclude(),
        });
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This round has already been submitted.');
      }

      throw error;
    }

    if (!updated) {
      throw new NotFoundException('Updated review task was not found.');
    }

    const next = await this.getNext({
      reviewer,
      round,
      allocate: true,
    });

    return {
      submitted: this.serializeTask(updated, reviewer),
      next,
    };
  }

  async getStats(query: ColdToolReviewReviewerQueryDto) {
    const reviewer = this.normalizeReviewer(query.reviewer);
    const round = query.round ?? ColdToolReviewRound.ROUND_1;

    await this.ensureTaskPoolSynced();
    await this.releaseTimedOutLocks();
    const taskWhere = this.buildTaskRelevantWhere(round);
    const inProgressWhere: Prisma.ColdToolReviewTaskWhereInput = {
      ...taskWhere,
      currentRound: round,
      taskStatus: ColdToolReviewTaskStatus.IN_PROGRESS,
    };

    const [teamTotal, completedCount, myCompletedCount, inProgressCount, myInProgressCount, decisionGroups] =
      await Promise.all([
        this.prisma.coldToolReviewTask.count({
          where: taskWhere,
        }),
        this.prisma.coldToolReviewRecord.count({
          where: {
            round,
          },
        }),
        this.prisma.coldToolReviewRecord.count({
          where: {
            round,
            reviewer,
          },
        }),
        this.prisma.coldToolReviewTask.count({
          where: inProgressWhere,
        }),
        this.prisma.coldToolReviewTask.count({
          where: {
            ...inProgressWhere,
            lockedBy: reviewer,
          },
        }),
        this.prisma.coldToolReviewRecord.groupBy({
          by: ['decision'],
          where: {
            round,
          },
          _count: {
            decision: true,
          },
        }),
      ]);

    return {
      round,
      lockTimeoutMinutes: REVIEW_LOCK_TIMEOUT_MS / 60_000,
      myProgress: {
        completed: myCompletedCount,
        inProgress: myInProgressCount,
      },
      teamProgress: {
        total: teamTotal,
        completed: completedCount,
        remaining: Math.max(teamTotal - completedCount, 0),
        inProgress: inProgressCount,
      },
      decisions: decisionGroups.map((item) => ({
        decision: item.decision,
        count: item._count.decision,
      })),
    };
  }

  async getQueue(query: QueryColdToolReviewQueueDto) {
    const reviewer = this.normalizeReviewer(query.reviewer);
    const round = query.round ?? ColdToolReviewRound.ROUND_1;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const skip = (page - 1) * pageSize;

    await this.ensureTaskPoolSynced();
    await this.releaseTimedOutLocks();

    const search = this.cleanText(query.search, 200);
    const searchFilter = search
      ? {
          OR: [
            {
              analysisId: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              repository: {
                is: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            },
            {
              repository: {
                is: {
                  fullName: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            },
            {
              repository: {
                is: {
                  htmlUrl: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            },
          ],
        }
      : {};

    const decisionFilter = query.decision
      ? {
          records: {
            some: {
              round,
              decision: query.decision,
            },
          },
        }
      : {};

    const scopeFilter = this.buildQueueScopeFilter(query.scope, reviewer, round);
    const roundFilter = this.buildRoundQueueFilter(round, query.scope);

    const where: Prisma.ColdToolReviewTaskWhereInput = {
      ...roundFilter,
      ...scopeFilter,
      ...decisionFilter,
      ...searchFilter,
      ...(query.includeReleased
        ? {}
        : {
            NOT: {
              taskStatus: ColdToolReviewTaskStatus.RELEASED,
            },
          }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coldToolReviewTask.findMany({
        where,
        include: this.taskInclude(),
        skip,
        take: pageSize,
        orderBy: [
          {
            lockedAt: 'desc',
          },
          {
            lastSubmittedAt: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
      this.prisma.coldToolReviewTask.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeTask(item, reviewer)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async getHistory(analysisId: string) {
    await this.ensureTaskPoolSynced();
    await this.releaseTimedOutLocks();

    const task = await this.prisma.coldToolReviewTask.findUnique({
      where: { analysisId },
      include: this.taskInclude(),
    });

    if (!task) {
      throw new NotFoundException('Cold tool review history was not found.');
    }

    return this.serializeTask(task);
  }

  async releaseTimedOutLocks() {
    const expiration = new Date(Date.now() - REVIEW_LOCK_TIMEOUT_MS);
    const released = await this.prisma.coldToolReviewTask.updateMany({
      where: {
        taskStatus: ColdToolReviewTaskStatus.IN_PROGRESS,
        lockedAt: {
          lt: expiration,
        },
      },
      data: {
        taskStatus: ColdToolReviewTaskStatus.RELEASED,
        lockedBy: null,
        lockedAt: null,
      },
    });

    return {
      releasedCount: released.count,
    };
  }

  private async ensureTaskPoolSynced() {
    while (true) {
      const missingAnalyses = await this.prisma.repositoryAnalysis.findMany({
        where: {
          tags: {
            has: 'cold_tool_evaluated',
          },
          coldToolReviewTask: {
            is: null,
          },
        },
        select: {
          id: true,
          repositoryId: true,
        },
        take: 5000,
      });

      if (!missingAnalyses.length) {
        return;
      }

      await this.prisma.coldToolReviewTask.createMany({
        data: missingAnalyses.map((analysis) => ({
          analysisId: analysis.id,
          repositoryId: analysis.repositoryId,
        })),
        skipDuplicates: true,
      });

      if (missingAnalyses.length < 5000) {
        return;
      }
    }
  }

  private taskInclude() {
    return {
      repository: {
        select: {
          id: true,
          name: true,
          fullName: true,
          htmlUrl: true,
          stars: true,
          description: true,
          categoryL1: true,
          categoryL2: true,
        },
      },
      analysis: {
        select: {
          id: true,
          analysisJson: true,
          ideaSnapshotJson: true,
          insightJson: true,
          extractedIdeaJson: true,
          analyzedAt: true,
          updatedAt: true,
        },
      },
      records: {
        orderBy: {
          createdAt: 'desc' as const,
        },
      },
    } satisfies Prisma.ColdToolReviewTaskInclude;
  }

  private buildAssignableWhere(
    round: ColdToolReviewRound,
  ): Prisma.ColdToolReviewTaskWhereInput {
    if (round === ColdToolReviewRound.ROUND_1) {
      return {
        currentRound: ColdToolReviewRound.ROUND_1,
        taskStatus: {
          in: [
            ColdToolReviewTaskStatus.PENDING,
            ColdToolReviewTaskStatus.RELEASED,
          ],
        },
        flowStatus: ColdToolReviewFlowStatus.PENDING_ROUND_1,
      };
    }

    return {
      currentRound: ColdToolReviewRound.ROUND_2,
      taskStatus: {
        in: [
          ColdToolReviewTaskStatus.PENDING,
          ColdToolReviewTaskStatus.RELEASED,
        ],
      },
      flowStatus: ColdToolReviewFlowStatus.PENDING_ROUND_2,
      records: {
        some: {
          round: ColdToolReviewRound.ROUND_1,
          decision: {
            in: [
              ColdToolReviewDecision.ROUND_1_KEEP,
              ColdToolReviewDecision.ROUND_1_PENDING,
            ],
          },
        },
      },
    };
  }

  private sortAssignmentCandidates(
    candidates: ReviewTaskDetail[],
    reviewer: string,
    round: ColdToolReviewRound,
  ) {
    if (round !== ColdToolReviewRound.ROUND_2) {
      return candidates;
    }

    return [...candidates].sort((left, right) => {
      const leftRound1Reviewer =
        left.records.find((record) => record.round === ColdToolReviewRound.ROUND_1)
          ?.reviewer ?? '';
      const rightRound1Reviewer =
        right.records.find((record) => record.round === ColdToolReviewRound.ROUND_1)
          ?.reviewer ?? '';
      const leftCross = leftRound1Reviewer && leftRound1Reviewer !== reviewer ? 0 : 1;
      const rightCross =
        rightRound1Reviewer && rightRound1Reviewer !== reviewer ? 0 : 1;

      if (leftCross !== rightCross) {
        return leftCross - rightCross;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  }

  private resolveTaskTransition(decision: ColdToolReviewDecision) {
    switch (decision) {
      case ColdToolReviewDecision.ROUND_1_KEEP:
      case ColdToolReviewDecision.ROUND_1_PENDING:
        return {
          currentRound: ColdToolReviewRound.ROUND_2,
          taskStatus: ColdToolReviewTaskStatus.PENDING,
          flowStatus: ColdToolReviewFlowStatus.PENDING_ROUND_2,
        };
      case ColdToolReviewDecision.ROUND_1_REJECT:
      case ColdToolReviewDecision.ROUND_2_REJECT:
        return {
          currentRound: ColdToolReviewRound.ROUND_2,
          taskStatus: ColdToolReviewTaskStatus.SUBMITTED,
          flowStatus: ColdToolReviewFlowStatus.ELIMINATED,
        };
      case ColdToolReviewDecision.ROUND_2_STRONG_KEEP:
        return {
          currentRound: ColdToolReviewRound.ROUND_2,
          taskStatus: ColdToolReviewTaskStatus.SUBMITTED,
          flowStatus: ColdToolReviewFlowStatus.FINAL_CANDIDATE,
        };
      case ColdToolReviewDecision.ROUND_2_KEEP:
        return {
          currentRound: ColdToolReviewRound.ROUND_2,
          taskStatus: ColdToolReviewTaskStatus.SUBMITTED,
          flowStatus: ColdToolReviewFlowStatus.BACKUP_CANDIDATE,
        };
      case ColdToolReviewDecision.ROUND_2_NEEDS_INFO:
        return {
          currentRound: ColdToolReviewRound.ROUND_2,
          taskStatus: ColdToolReviewTaskStatus.SUBMITTED,
          flowStatus: ColdToolReviewFlowStatus.NEEDS_INFO,
        };
      default:
        return {
          currentRound: ColdToolReviewRound.ROUND_1,
          taskStatus: ColdToolReviewTaskStatus.PENDING,
          flowStatus: ColdToolReviewFlowStatus.PENDING_ROUND_1,
        };
    }
  }

  private buildQueueScopeFilter(
    scope: ColdToolReviewQueueScope | undefined,
    reviewer: string,
    round: ColdToolReviewRound,
  ): Prisma.ColdToolReviewTaskWhereInput {
    switch (scope) {
      case ColdToolReviewQueueScope.MY_PENDING:
        return {
          currentRound: round,
          taskStatus: ColdToolReviewTaskStatus.IN_PROGRESS,
          lockedBy: reviewer,
        };
      case ColdToolReviewQueueScope.MY_REVIEWED:
        return {
          records: {
            some: {
              round,
              reviewer,
            },
          },
        };
      default:
        return {};
    }
  }

  private buildRoundQueueFilter(
    round: ColdToolReviewRound,
    scope?: ColdToolReviewQueueScope,
  ): Prisma.ColdToolReviewTaskWhereInput {
    if (scope === ColdToolReviewQueueScope.MY_REVIEWED) {
      return {};
    }

    if (round === ColdToolReviewRound.ROUND_1) {
      return {
        OR: [
          {
            currentRound: ColdToolReviewRound.ROUND_1,
          },
          {
            records: {
              some: {
                round: ColdToolReviewRound.ROUND_1,
              },
            },
          },
        ],
      };
    }

    return {
      records: {
        some: {
          round: ColdToolReviewRound.ROUND_1,
          decision: {
            in: [
              ColdToolReviewDecision.ROUND_1_KEEP,
              ColdToolReviewDecision.ROUND_1_PENDING,
            ],
          },
        },
      },
    };
  }

  private buildTaskRelevantWhere(round: ColdToolReviewRound): Prisma.ColdToolReviewTaskWhereInput {
    if (round === ColdToolReviewRound.ROUND_1) {
      return {};
    }

    return {
      records: {
        some: {
          round: ColdToolReviewRound.ROUND_1,
          decision: {
            in: [
              ColdToolReviewDecision.ROUND_1_KEEP,
              ColdToolReviewDecision.ROUND_1_PENDING,
            ],
          },
        },
      },
    };
  }

  private isTaskRelevantToRound(
    task: {
      currentRound: ColdToolReviewRound;
      records: Array<{ round: ColdToolReviewRound; decision: ColdToolReviewDecision }>;
    },
    round: ColdToolReviewRound,
  ) {
    if (round === ColdToolReviewRound.ROUND_1) {
      return true;
    }

    return task.records.some(
      (record) =>
        record.round === ColdToolReviewRound.ROUND_1 &&
        (record.decision === ColdToolReviewDecision.ROUND_1_KEEP ||
          record.decision === ColdToolReviewDecision.ROUND_1_PENDING),
    );
  }

  private serializeTask(task: ReviewTaskDetail, reviewer?: string) {
    const analysisJson = this.readJsonObject(task.analysis.analysisJson);
    const coldToolPool = this.readJsonObject(
      analysisJson?.coldToolPool as Prisma.JsonValue | undefined,
    );
    const snapshot = this.readJsonObject(task.analysis.ideaSnapshotJson);
    const insight = this.readJsonObject(task.analysis.insightJson);
    const extractedIdea = this.readJsonObject(task.analysis.extractedIdeaJson);
    const previousRound =
      task.currentRound === ColdToolReviewRound.ROUND_2
        ? task.records.find((record) => record.round === ColdToolReviewRound.ROUND_1) ?? null
        : null;
    const currentRoundRecord = task.records.find(
      (record) => record.round === task.currentRound,
    );

    return {
      id: task.id,
      analysisId: task.analysisId,
      repositoryId: task.repositoryId,
      currentRound: task.currentRound,
      taskStatus: task.taskStatus,
      flowStatus: task.flowStatus,
      lockedBy: task.lockedBy,
      lockedAt: task.lockedAt?.toISOString() ?? null,
      isLockedByMe: Boolean(reviewer && task.lockedBy === reviewer),
      repository: {
        id: task.repository.id,
        name: task.repository.name,
        fullName: task.repository.fullName,
        stars: task.repository.stars,
        htmlUrl: task.repository.htmlUrl,
      },
      card: {
        projectName: task.repository.name,
        stars: task.repository.stars,
        repositoryUrl: task.repository.htmlUrl,
        oneLiner:
          this.cleanText(coldToolPool?.summaryZh) ||
          this.cleanText(insight?.oneLinerZh) ||
          this.cleanText(snapshot?.oneLinerZh) ||
          this.cleanText(extractedIdea?.ideaSummary) ||
          this.cleanText(task.repository.description) ||
          task.repository.fullName,
        targetUsers:
          this.cleanText(coldToolPool?.targetUsersZh) ||
          this.cleanText(extractedIdea?.targetUsers?.find?.(Boolean)) ||
          '目标用户仍待确认',
        useCase:
          this.cleanText(coldToolPool?.useCaseZh) ||
          this.cleanText(extractedIdea?.problem) ||
          this.cleanText(snapshot?.reason) ||
          '使用场景仍待确认',
        payer:
          this.cleanText(coldToolPool?.buyerTypeZh) ||
          this.cleanText(extractedIdea?.monetization) ||
          '付费方仍待确认',
      },
      meta: {
        fitsColdToolPool: this.toBoolean(coldToolPool?.fitsColdToolPool),
        isRealUserTool: this.toBoolean(coldToolPool?.isRealUserTool),
        hasPayingIntent: this.toBoolean(coldToolPool?.hasPayingIntent),
        willingnessToPay:
          this.cleanText(coldToolPool?.willingnessToPayLabelZh) || '未知',
        categoryMain:
          this.cleanText(snapshot?.category?.main) ||
          this.cleanText(task.repository.categoryL1) ||
          '未分类',
        categorySub:
          this.cleanText(snapshot?.category?.sub) ||
          this.cleanText(task.repository.categoryL2) ||
          '未分类',
        evaluatedAt:
          this.cleanText(coldToolPool?.evaluatedAt) ||
          task.analysis.analyzedAt?.toISOString() ||
          task.analysis.updatedAt?.toISOString() ||
          null,
      },
      previousRound: previousRound
        ? this.serializeRecord(previousRound)
        : null,
      currentRoundRecord: currentRoundRecord
        ? this.serializeRecord(currentRoundRecord)
        : null,
      history: task.records.map((record) => this.serializeRecord(record)),
    };
  }

  private findPreviousRoundRecord(
    records: Array<{
      round: ColdToolReviewRound;
      decision: ColdToolReviewDecision;
      reviewer: string;
      note: string | null;
      disagreementTags: string[];
      reasonTags: string[];
      isDisputed: boolean;
      id: string;
      createdAt: Date;
    }>,
    round: ColdToolReviewRound,
  ) {
    if (round === ColdToolReviewRound.ROUND_2) {
      return records.find((record) => record.round === ColdToolReviewRound.ROUND_1) ?? null;
    }

    if (round === ColdToolReviewRound.ROUND_3) {
      return records.find((record) => record.round === ColdToolReviewRound.ROUND_2) ?? null;
    }

    return null;
  }

  private hasLaterRoundRecord(
    records: Array<{
      round: ColdToolReviewRound;
    }>,
    round: ColdToolReviewRound,
  ) {
    const rank = this.getRoundRank(round);
    return records.some((record) => this.getRoundRank(record.round) > rank);
  }

  private getRoundRank(round: ColdToolReviewRound) {
    switch (round) {
      case ColdToolReviewRound.ROUND_1:
        return 1;
      case ColdToolReviewRound.ROUND_2:
        return 2;
      case ColdToolReviewRound.ROUND_3:
        return 3;
      default:
        return 0;
    }
  }

  private getDecisionBucket(decision?: ColdToolReviewDecision | null) {
    switch (decision) {
      case ColdToolReviewDecision.ROUND_1_KEEP:
      case ColdToolReviewDecision.ROUND_2_KEEP:
      case ColdToolReviewDecision.ROUND_2_STRONG_KEEP:
        return 'positive';
      case ColdToolReviewDecision.ROUND_1_PENDING:
      case ColdToolReviewDecision.ROUND_2_NEEDS_INFO:
        return 'neutral';
      case ColdToolReviewDecision.ROUND_1_REJECT:
      case ColdToolReviewDecision.ROUND_2_REJECT:
        return 'negative';
      default:
        return null;
    }
  }

  private hasDecisionBucketDisagreement(
    previousDecision?: ColdToolReviewDecision | null,
    currentDecision?: ColdToolReviewDecision | null,
  ) {
    const previousBucket = this.getDecisionBucket(previousDecision);
    const currentBucket = this.getDecisionBucket(currentDecision);

    if (!previousBucket || !currentBucket) {
      return false;
    }

    return previousBucket !== currentBucket;
  }

  private serializeRecord(
    record: {
      id: string;
      round: ColdToolReviewRound;
      reviewer: string;
      decision: ColdToolReviewDecision;
      reasonTags: string[];
      disagreementTags: string[];
      note: string | null;
      isDisputed: boolean;
      createdAt: Date;
    },
  ) {
    return {
      id: record.id,
      round: record.round,
      reviewer: record.reviewer,
      decision: record.decision,
      reasonTags: record.reasonTags,
      disagreementTags: record.disagreementTags,
      note: record.note,
      isDisputed: record.isDisputed,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private assertDecisionMatchesRound(
    round: ColdToolReviewRound,
    decision: ColdToolReviewDecision,
  ) {
    if (
      round === ColdToolReviewRound.ROUND_1 &&
      !ROUND_1_DECISIONS.has(decision)
    ) {
      throw new BadRequestException('Round 1 decision is invalid.');
    }

    if (
      round === ColdToolReviewRound.ROUND_2 &&
      !ROUND_2_DECISIONS.has(decision)
    ) {
      throw new BadRequestException('Round 2 decision is invalid.');
    }
  }

  private normalizeReviewer(value: string) {
    const normalized = this.cleanText(value, 80);
    if (!normalized) {
      throw new BadRequestException('Reviewer is required.');
    }

    return normalized;
  }

  private cleanText(value: unknown, maxLength = 240) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, maxLength);
  }

  private cleanStringList(values: unknown) {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => this.cleanText(value, 80))
      .filter((value): value is string => Boolean(value));
  }

  private readJsonObject(value: Prisma.JsonValue | undefined | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, any>;
  }

  private toBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : null;
  }
}
