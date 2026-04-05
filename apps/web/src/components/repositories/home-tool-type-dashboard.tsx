import Link from 'next/link';
import { getRepositoryDecisionSummary } from '@/lib/repository-decision';
import {
  buildRepositoryAnchorId,
  buildRepositoryDetailHref,
  withHash,
} from '@/lib/repository-detail-navigation';
import { COMMON_CATEGORY_SUGGESTIONS } from '@/lib/repository-category-suggestions';
import { buildRepositoryListSearchParams, RepositoryListItem } from '@/lib/types/repository';
import { HomeToolTypeExportButtons } from './home-tool-type-export-buttons';

type HomeToolTypeDashboardProps = {
  items: RepositoryListItem[];
};

type HomeToolTypeRow = {
  id: string;
  oneLiner: string;
  fullName: string;
  href: string;
  anchorId: string;
  htmlUrl: string;
  toolType: string;
  toolTypeFilter: string;
  verdict: string;
  moneyPriority: string;
  targetUsers: string;
  monetization: string;
  stars: number;
};

export function HomeToolTypeDashboard({
  items,
}: HomeToolTypeDashboardProps) {
  const rows = buildHomeToolTypeRows(items);
  const categories = summarizeCategories(rows);
  const topCategory = categories[0];

  return (
    <section className="space-y-5">
      <section className="relative overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.92)_52%,rgba(224,242,254,0.9)_100%)] p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.24)]">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.14),transparent_72%)] lg:block" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              工具类型总览
            </p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
              首页直接按工具类型看多个项目，方便你横向比较和导出表格。
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              不再先看单个项目。现在首页默认把项目按工具类型整理，再按挣钱优先级和 Stars 排序，方便你一次扫多条。
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <DashboardStat
                label="当前样本"
                value={`${rows.length} 条`}
                helper="首页用于横向比较的项目数。"
              />
              <DashboardStat
                label="类型分布"
                value={`${categories.length} 类`}
                helper="先看类型，再看单项目。"
              />
              <DashboardStat
                label="当前高频"
                value={topCategory ? topCategory.label : '待分类'}
                helper={topCategory ? `${topCategory.count} 条` : '暂无'}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 lg:max-w-[22rem] lg:justify-end">
            <HomeToolTypeExportButtons rows={rows} />
            <Link
              href="/repositories"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_58%,#0f766e_100%)] px-5 text-sm font-semibold text-white transition hover:opacity-95"
            >
              去完整项目列表
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.label}
              href={buildCategoryHref(category.filterValue)}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
            >
              {category.label} {category.count}
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[34px] border border-slate-200/80 bg-white/96 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.26)] backdrop-blur">
        <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.92)_100%)] px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            首页表格
          </p>
          <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            先按工具类型排，再看每个类型里最值得继续看的项目。
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/90">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3">工具类型</th>
                <th className="px-4 py-3">一句话</th>
                <th className="px-4 py-3">最终结论</th>
                <th className="px-4 py-3">挣钱优先级</th>
                <th className="px-4 py-3">用户是谁</th>
                <th className="px-4 py-3">能不能收费</th>
                <th className="px-4 py-3 text-right">Stars</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="align-top transition hover:bg-sky-50/40">
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-900">
                      {row.toolType}
                    </span>
                  </td>
                  <td id={row.anchorId} className="px-4 py-4">
                    <div className="space-y-1">
                      <Link
                        href={row.href}
                        className="font-medium text-slate-950 transition hover:text-slate-700"
                      >
                        {row.oneLiner}
                      </Link>
                      <p className="text-xs text-slate-500">{row.fullName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{row.verdict}</td>
                  <td className="px-4 py-4 text-slate-700">{row.moneyPriority}</td>
                  <td className="px-4 py-4 text-slate-700">{row.targetUsers}</td>
                  <td className="px-4 py-4 text-slate-700">{row.monetization}</td>
                  <td className="px-4 py-4 text-right font-medium text-slate-700">
                    {row.stars.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function DashboardStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/78 px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function buildHomeToolTypeRows(items: RepositoryListItem[]): HomeToolTypeRow[] {
  return [...items]
    .map((item) => {
      const summary = getRepositoryDecisionSummary(item);
      const anchorId = buildRepositoryAnchorId(item.id, 'home-tool');
      const normalizedToolType = normalizeHomeToolType(summary.categoryLabel || '待分类');

      return {
        id: item.id,
        oneLiner: summary.oneLiner,
        fullName: item.fullName,
        href: buildRepositoryDetailHref(item.id, withHash('/', anchorId)),
        anchorId,
        htmlUrl: item.htmlUrl,
        toolType: normalizedToolType.label,
        toolTypeFilter: normalizedToolType.filterValue,
        verdict: summary.finalDecisionLabel,
        moneyPriority: summary.moneyPriority.label,
        targetUsers: summary.targetUsersLabel,
        monetization: summary.monetizationLabel,
        stars: item.stars,
      };
    })
    .sort((left, right) => compareToolTypeRows(left, right));
}

function compareToolTypeRows(left: HomeToolTypeRow, right: HomeToolTypeRow) {
  const categoryDelta = compareCategoryLabel(left.toolType, right.toolType);

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  const priorityDelta = comparePriorityLabel(left.moneyPriority, right.moneyPriority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return right.stars - left.stars;
}

function summarizeCategories(rows: HomeToolTypeRow[]) {
  const counts = rows.reduce<Map<string, number>>((map, row) => {
    map.set(row.toolType, (map.get(row.toolType) ?? 0) + 1);
    return map;
  }, new Map());

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      filterValue: label,
      count,
    }))
    .sort((left, right) => compareCategoryLabel(left.label, right.label));
}

function compareCategoryLabel(left: string, right: string) {
  const leftIndex = COMMON_CATEGORY_SUGGESTIONS.indexOf(
    left as (typeof COMMON_CATEGORY_SUGGESTIONS)[number],
  );
  const rightIndex = COMMON_CATEGORY_SUGGESTIONS.indexOf(
    right as (typeof COMMON_CATEGORY_SUGGESTIONS)[number],
  );

  if (leftIndex >= 0 && rightIndex >= 0) {
    return leftIndex - rightIndex;
  }

  if (leftIndex >= 0) {
    return -1;
  }

  if (rightIndex >= 0) {
    return 1;
  }

  return left.localeCompare(right, 'zh-CN');
}

function comparePriorityLabel(left: string, right: string) {
  const order = ['P0', 'P1', 'P2', 'P3'];
  const leftPrefix = order.find((item) => left.startsWith(item));
  const rightPrefix = order.find((item) => right.startsWith(item));
  const leftIndex = leftPrefix ? order.indexOf(leftPrefix) : order.length;
  const rightIndex = rightPrefix ? order.indexOf(rightPrefix) : order.length;

  return leftIndex - rightIndex;
}

function buildCategoryHref(category: string) {
  const search = buildRepositoryListSearchParams({
    page: 1,
    pageSize: 20,
    view: 'all',
    displayMode: 'insight',
    finalCategory: category,
    sortBy: 'moneyPriority',
    order: 'desc',
  });

  return search ? `/repositories?${search}` : '/repositories';
}

function normalizeHomeToolType(rawLabel: string) {
  const normalized = rawLabel.trim();

  if (!normalized) {
    return {
      label: '其他',
      filterValue: '其他',
    };
  }

  const segments = normalized
    .split(/[、,/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const mostSpecific = segments[segments.length - 1] ?? normalized;
  const canonical = normalizeHomeToolTypeAlias(mostSpecific);

  return {
    label: canonical,
    filterValue: canonical,
  };
}

function normalizeHomeToolTypeAlias(label: string) {
  const normalized = label.trim();

  const aliasMap: Record<string, string> = {
    'AI Agent': 'AI工具',
    'AI应用': 'AI工具',
    'AI应用 / AI Agent': 'AI工具',
    '数据管道': '数据工具',
    DevOps: '部署工具',
    '应用搭建': '平台类',
    '命令行工具': '开发工具',
  };

  return aliasMap[normalized] ?? normalized;
}
