/**
 * Building blocks for Dashboard widgets (RBAC Phase 6): panels, stat cards,
 * distribution bars, case rows and the loading / error / empty states.
 * Presentational only — no fetching.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, RotateCw } from "lucide-react";
import type { DashboardCaseItem, DashboardScope, ActivitySource } from "@/lib/api";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export const SCOPE_LABEL: Record<DashboardScope, string> = {
  own: "Mine",
  team: "My team",
  all: "Company-wide",
};

const SOURCE_LABEL: Record<ActivitySource, string> = {
  created: "case created",
  updated: "case updated",
  call_log: "call / contact logged",
  comment: "comment",
  task: "task added",
  document: "document added",
};
export const activitySourceLabel = (s: ActivitySource) => SOURCE_LABEL[s];

/** The actual elapsed time since `iso` — "3 h", "12 days" — never a bucket. */
export function age(iso: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}
export const ago = (iso: string) => {
  const a = age(iso);
  return a === "just now" ? a : `${a} ago`;
};

/** A titled glass panel; the body is supplied by the widget. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass-panel p-4 h-full flex flex-col min-w-0", className)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/40">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-xs text-[var(--color-primary)] inline-flex items-center gap-1 hover:underline shrink-0">
      {label} <ArrowRight size={12} />
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  color,
  testId,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="glass-panel p-4 relative overflow-hidden hover:brightness-110 transition-all"
      style={{ boxShadow: `inset 0 1px 0 ${color}66` }}
    >
      <div className="absolute -top-10 -right-10 size-24 rounded-full opacity-20 blur-3xl" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="label-eyebrow">{label}</div>
          <div className="text-2xl font-bold tracking-tight mt-1.5" data-testid={testId ? `${testId}-value` : undefined}>
            {value}
          </div>
          {hint && <div className="text-[11px] text-white/40 mt-0.5 truncate">{hint}</div>}
        </div>
        <div className="size-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}1f`, color }}>
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

/** Stat cards in a responsive row. */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "md:grid-cols-3 xl:grid-cols-5",
      )}
    >
      {children}
    </div>
  );
}

/** Horizontal bars for a distribution. Zero rows stay visible: a real 0 is data. */
export function Bars({
  rows,
  color = "var(--color-primary)",
}: {
  rows: { key: string; label: string; count: number; color?: string }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 text-xs" data-testid={`bar-${r.key}`}>
          <span className="w-28 shrink-0 truncate text-white/60 capitalize">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, background: r.color ?? color }}
            />
          </div>
          <span className="w-8 text-right tabular-nums font-semibold">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="text-xs text-white/40 py-6 text-center">{children}</div>;
}

export function CaseRow({ c, detail }: { c: DashboardCaseItem; detail?: ReactNode }) {
  return (
    <Link href={`/cases/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors min-w-0">
      <span className="font-mono text-xs text-white/40 w-16 shrink-0">{c.caseNumber}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{c.title}</div>
        <div className="text-xs text-white/40 truncate">{detail ?? c.ownerName}</div>
      </div>
      <span className="hidden sm:inline-flex">
        <StatusBadge status={c.status} />
      </span>
      <PriorityBadge priority={c.priority} />
    </Link>
  );
}

// ── States ──────────────────────────────────────────────────────────────────

export function Skeleton({ variant }: { variant: "stats" | "panel" }) {
  if (variant === "stats") {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-panel p-4 h-[88px] animate-pulse">
            <div className="h-2 w-20 rounded bg-white/10" />
            <div className="h-6 w-10 rounded bg-white/10 mt-3" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="glass-panel p-4 h-full animate-pulse" aria-busy="true">
      <div className="h-3 w-32 rounded bg-white/10" />
      <div className="space-y-2 mt-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded bg-white/5" />
        ))}
      </div>
    </div>
  );
}

/** Shown instead of any number when the dashboard could not be loaded. */
export function WidgetError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="glass-panel p-4 h-full flex items-center gap-3 text-sm text-white/60" data-testid="dashboard-widget-error">
      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-white/80">{title}</span> couldn't be loaded.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
      >
        <RotateCw size={12} /> Retry
      </button>
    </div>
  );
}
