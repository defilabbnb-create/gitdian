import { RepositoryDetail } from '@/lib/types/repository';

type FileTreeEntry = {
  name: string;
  path: string;
  type: string;
  size: number | null;
};

type RepositoryDetailContentSummaryProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailContentSummary({
  repository,
}: RepositoryDetailContentSummaryProps) {
  const content = repository.content;
  const readmePreview = content?.readmeText?.slice(0, 1200) || '';
  const fileTreeEntries = normalizeFileTree(content?.fileTree).slice(0, 18);
  const rootFiles = normalizeStringArray(content?.rootFiles).slice(0, 12);
  const packageManifests = normalizeStringArray(content?.packageManifests).slice(0, 8);
  const recentCommits = normalizeObjectArray(content?.recentCommits).slice(0, 5);
  const recentIssues = normalizeObjectArray(content?.recentIssues).slice(0, 5);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Content Summary
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        README 与仓库内容摘要
      </h2>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <TextBlock
            title="README 摘要"
            content={
              readmePreview
                ? `${readmePreview}${content?.readmeText && content.readmeText.length > 1200 ? '...' : ''}`
                : '当前还没有 README 内容摘要。'
            }
          />
          <FileTreePanel
            title="目录内容"
            items={fileTreeEntries}
            emptyText="当前没有可展示的目录内容。"
          />
          <TagPanel
            title="Root Files"
            items={rootFiles}
            emptyText="暂无 root files 摘要。"
          />
          <TagPanel
            title="Package Manifests"
            items={packageManifests}
            emptyText="暂无 package manifests 摘要。"
          />
        </div>

        <div className="space-y-4">
          <TagPanel
            title="工程化特征"
            items={[
              content?.hasDockerfile ? 'Dockerfile' : null,
              content?.hasCompose ? 'Compose' : null,
              content?.hasCi ? 'CI' : null,
              content?.hasTests ? 'Tests' : null,
              content?.hasDocs ? 'Docs' : null,
              content?.hasEnvExample ? '.env.example' : null,
            ].filter(Boolean) as string[]}
            emptyText="当前没有明显工程化特征。"
          />
          <ObjectList title="Recent Commits" items={recentCommits} emptyText="暂无 commit 摘要。" />
          <ObjectList title="Recent Issues" items={recentIssues} emptyText="暂无 issue 摘要。" />
        </div>
      </div>
    </section>
  );
}

function TextBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{content}</p>
    </div>
  );
}

function TagPanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${title}-${item}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-slate-600">{emptyText}</p>
      )}
    </div>
  );
}

function ObjectList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  emptyText: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items.length ? (
        <div className="mt-4 grid gap-3">
          {items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700"
            >
              <pre className="whitespace-pre-wrap break-words font-sans leading-6">
                {summarizeObject(item)}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-slate-600">{emptyText}</p>
      )}
    </div>
  );
}

function FileTreePanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: FileTreeEntry[];
  emptyText: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items.length ? (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <div
              key={`${item.type}-${item.path}`}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {item.type === 'dir' ? '[DIR] ' : '[FILE] '}
                  {item.name}
                </p>
                <p className="mt-1 break-all text-xs leading-5 text-slate-500">{item.path}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                <p>{item.type === 'dir' ? 'Folder' : 'File'}</p>
                {typeof item.size === 'number' ? <p className="mt-1">{formatSize(item.size)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-slate-600">{emptyText}</p>
      )}
    </div>
  );
}

function summarizeObject(value: Record<string, unknown>) {
  return Object.entries(value)
    .slice(0, 4)
    .map(([key, entryValue]) => `${key}: ${String(entryValue)}`)
    .join('\n');
}

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeStringArray(
  value: unknown[] | Record<string, unknown>[] | Record<string, unknown> | null | undefined,
) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          const normalized = item as Record<string, unknown>;
          return String(normalized.path ?? normalized.name ?? JSON.stringify(item));
        }

        return '';
      })
      .filter(Boolean);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value);
  }

  return [];
}

function normalizeFileTree(
  value: unknown[] | Record<string, unknown> | null | undefined,
): FileTreeEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const normalized = item as Record<string, unknown>;
      const name =
        typeof normalized.name === 'string'
          ? normalized.name
          : typeof normalized.path === 'string'
            ? normalized.path.split('/').pop() || normalized.path
            : null;
      const path = typeof normalized.path === 'string' ? normalized.path : name;

      if (!name || !path) {
        return null;
      }

      return {
        name,
        path,
        type: typeof normalized.type === 'string' ? normalized.type : 'file',
        size: typeof normalized.size === 'number' ? normalized.size : null,
      };
    })
    .filter((item): item is FileTreeEntry => item !== null);
}

function normalizeObjectArray(value: Array<Record<string, unknown>> | null | undefined) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      )
    : [];
}
