import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailMetadataProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailMetadata({
  repository,
}: RepositoryDetailMetadataProps) {
  const metadataItems = [
    ['仓库作者', repository.ownerLogin],
    ['仓库全名', repository.fullName],
    ['主页', repository.homepage || '--'],
    ['语言', repository.language || '--'],
    ['License', repository.license || '--'],
    ['默认分支', repository.defaultBranch || '--'],
    ['创建时间', formatDate(repository.createdAtGithub)],
    ['最近更新', formatDate(repository.updatedAtGithub)],
    ['最近推送', formatDate(repository.pushedAtGithub)],
    ['来源', repository.sourceType],
  ];

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        仓库元数据
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        基础仓库信息
      </h2>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metadataItems.map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {label}
            </p>
            <p className="mt-3 break-words text-sm leading-7 text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <TagCluster
          title="Topics"
          items={repository.topics}
          emptyText="这个仓库还没有 Topics。"
        />
        <TagCluster
          title="仓库状态"
          items={[
            repository.archived ? '已归档' : '未归档',
            repository.disabled ? '已停用' : '可访问',
            repository.hasWiki ? '有 Wiki' : '无 Wiki',
            repository.hasIssues ? '有 Issues' : 'Issues 已关闭',
          ]}
          emptyText="暂无状态信息。"
        />
      </div>

      {repository.snapshots.length ? (
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            最近快照
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {repository.snapshots.slice(0, 3).map((snapshot) => (
              <div
                key={snapshot.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700"
              >
                <p className="font-semibold text-slate-900">
                  {formatDate(snapshot.snapshotAt)}
                </p>
                <p className="mt-2">Stars: {snapshot.stars}</p>
                <p>Forks: {snapshot.forks}</p>
                <p>Open Issues: {snapshot.openIssues}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TagCluster({
  title,
  items,
  emptyText,
}: {
  title: string;
  items?: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items?.length ? (
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

function formatDate(value?: string | null) {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
