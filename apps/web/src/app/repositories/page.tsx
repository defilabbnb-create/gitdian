import { AppPageShell } from '@/components/app/page-shell';
import { RepositoriesExplorer } from '@/components/repositories/repositories-explorer';
import { normalizeRepositoryListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type RepositoriesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RepositoriesPage({
  searchParams,
}: RepositoriesPageProps) {
  const rawSearchParams = ((await searchParams) ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const query = normalizeRepositoryListQuery(rawSearchParams);

  return (
    <AppPageShell tone="slate">
      <RepositoriesExplorer query={query} />
    </AppPageShell>
  );
}
