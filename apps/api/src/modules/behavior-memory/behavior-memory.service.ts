import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildBehaviorMemoryState,
  buildModelBehaviorMemoryInput,
  createEmptyBehaviorMemoryState,
  mergeBehaviorMemoryStates,
  normalizeBehaviorMemoryState,
  type BehaviorMemoryState,
  type ModelBehaviorMemoryInput,
} from 'shared';

const BEHAVIOR_MEMORY_CONFIG_KEY = 'behavior.memory.state';

@Injectable()
export class BehaviorMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(): Promise<BehaviorMemoryState> {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
      },
    });

    if (!row?.configValue) {
      return createEmptyBehaviorMemoryState();
    }

    return normalizeBehaviorMemoryState(row.configValue);
  }

  async updateState(payload: unknown): Promise<BehaviorMemoryState> {
    const current = await this.getState();
    const normalized = normalizeBehaviorMemoryState(payload);
    const merged = mergeBehaviorMemoryStates(current, normalized);
    const nextState = buildBehaviorMemoryState(merged.recentActionOutcomes, {
      ...merged.runtimeStats,
      syncedAt: new Date().toISOString(),
    });

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
      },
      update: {
        configValue: this.toJsonValue(nextState),
      },
      create: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
        configValue: this.toJsonValue(nextState),
      },
    });

    return nextState;
  }

  async clearState(): Promise<BehaviorMemoryState> {
    const nextState = createEmptyBehaviorMemoryState();

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
      },
      update: {
        configValue: this.toJsonValue(nextState),
      },
      create: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
        configValue: this.toJsonValue(nextState),
      },
    });

    return nextState;
  }

  async getModelInput(): Promise<ModelBehaviorMemoryInput> {
    const state = await this.getState();
    return buildModelBehaviorMemoryInput(state.profile);
  }

  async recordQueueInfluence(applied: boolean) {
    const current = await this.getState();
    const nextState = buildBehaviorMemoryState(current.recentActionOutcomes, {
      ...current.runtimeStats,
      syncedAt: current.runtimeStats.syncedAt ?? new Date().toISOString(),
      queuePriorityEvaluations:
        (current.runtimeStats.queuePriorityEvaluations ?? 0) + 1,
      queuePriorityBoostedCount:
        (current.runtimeStats.queuePriorityBoostedCount ?? 0) + (applied ? 1 : 0),
    });

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
      },
      update: {
        configValue: this.toJsonValue(nextState),
      },
      create: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
        configValue: this.toJsonValue(nextState),
      },
    });

    return nextState;
  }

  async recordQueueInfluenceBulk(appliedFlags: boolean[]) {
    if (!appliedFlags.length) {
      return this.getState();
    }

    const current = await this.getState();
    let boostedCount = 0;
    for (const applied of appliedFlags) {
      if (applied) {
        boostedCount += 1;
      }
    }

    const nextState = buildBehaviorMemoryState(current.recentActionOutcomes, {
      ...current.runtimeStats,
      syncedAt: current.runtimeStats.syncedAt ?? new Date().toISOString(),
      queuePriorityEvaluations:
        (current.runtimeStats.queuePriorityEvaluations ?? 0) +
        appliedFlags.length,
      queuePriorityBoostedCount:
        (current.runtimeStats.queuePriorityBoostedCount ?? 0) + boostedCount,
    });

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
      },
      update: {
        configValue: this.toJsonValue(nextState),
      },
      create: {
        configKey: BEHAVIOR_MEMORY_CONFIG_KEY,
        configValue: this.toJsonValue(nextState),
      },
    });

    return nextState;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
