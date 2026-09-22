import type { CaseStatus, CasePriority, TaskStatus } from "@/lib/api";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<CaseStatus, string> = {
  intake: "Intake",
  review: "Review",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
};

const PRIORITY_LABEL: Record<CasePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const TASK_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span
      className={cn(
        `badge-${status}`,
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-tight",
        className,
      )}
    >
      <span className="inline-block size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: CasePriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        `badge-priority-${priority}`,
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-tight capitalize",
        className,
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const map: Record<TaskStatus, string> = {
    pending: "bg-white/5 text-white/60",
    in_progress: "badge-in_progress",
    completed: "badge-completed",
  };
  return (
    <span
      className={cn(
        map[status],
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        className,
      )}
    >
      {TASK_LABEL[status]}
    </span>
  );
}
