import { JobStatus } from '@/lib/types/repository';

type JobStatusBadgeProps = {
  status: JobStatus;
};

const statusTone: Record<JobStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-sky-100 text-sky-700',
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-rose-100 text-rose-700',
};

export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusTone[status]}`}
    >
      {status}
    </span>
  );
}
