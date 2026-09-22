import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FolderKanban,
  CheckCircle2,
  ListTodo,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { API, fetchJson } from "@/lib/api";
import type { CaseWithCustomer, Stats, Task } from "@/lib/api";
import { StatusBadge, PriorityBadge, TaskStatusBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STATUS_COLOR = {
  intake: "#3b82f6",
  review: "#a855f7",
  in_progress: "#29f312",
  waiting: "#f59e0b",
  completed: "#ef4444",
} as const;

export function Dashboard() {
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchJson<Stats>(API("/api/stats")),
  });
  const recentCases = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchJson<CaseWithCustomer[]>(API("/api/cases")),
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchJson<Task[]>(API("/api/tasks")),
  });

  const { user } = useAuth();
  const firstName = user?.name.split(" ")[0] ?? "there";

  const attention =
    (tasks.data ?? []).filter((t) => t.status !== "completed").length;
  const openTasks = (tasks.data ?? [])
    .filter((t) => t.status !== "completed")
    .slice(0, 5);
  const last5Cases = (recentCases.data ?? []).slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="text-xl font-bold tracking-tight">{greeting()}, {firstName}</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Here's what's happening across your cases today.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[11px] font-semibold border border-[var(--color-primary)]/30 neon-border">
          <Sparkles size={11} />
          {attention} task{attention === 1 ? "" : "s"} need attention
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          color="#3b82f6"
          label="Total cases"
          value={stats.data?.totalCases ?? 0}
          icon={FolderKanban}
        />
        <StatCard
          color="#10b981"
          label="Completed"
          value={stats.data?.completedCases ?? 0}
          icon={CheckCircle2}
        />
        <StatCard
          color="#f59e0b"
          label="Open tasks"
          value={stats.data?.openTasks ?? 0}
          icon={ListTodo}
        />
        <StatCard
          color="#a855f7"
          label="Customers"
          value={stats.data?.totalCustomers ?? 0}
          icon={Users}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 glass-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Case & task volume</h2>
              <p className="text-[11px] text-white/40">Last 30 days</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <Legend color="#29f312" label="Cases" />
              <Legend color="#3b82f6" label="Tasks" />
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.data?.trend30 ?? []}>
                <defs>
                  <linearGradient id="gCases" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#29f312" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#29f312" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} tickFormatter={(s) => s.slice(5)} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(20,20,25,0.9)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area dataKey="cases" stroke="#29f312" fill="url(#gCases)" strokeWidth={2} />
                <Area dataKey="tasks" stroke="#3b82f6" fill="url(#gTasks)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 glass-panel p-4">
          <h2 className="text-sm font-semibold">Status breakdown</h2>
          <p className="text-[11px] text-white/40 mb-3">Cases by current status</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.data?.statusBreakdown ?? []} layout="vertical">
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="status"
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 10 }}
                  width={90}
                  tickFormatter={(s) => s.replace("_", " ")}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(20,20,25,0.9)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {(stats.data?.statusBreakdown ?? []).map((row) => (
                    <Cell key={row.status} fill={STATUS_COLOR[row.status]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent + Open Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Recent cases</h2>
            <Link href="/cases">
              <a className="text-xs text-[var(--color-primary)] inline-flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </a>
            </Link>
          </div>
          <div className="space-y-1.5">
            {last5Cases.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`}>
                <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors">
                  <span className="font-mono text-xs text-white/40 w-16 shrink-0">
                    {c.caseNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.title}</div>
                    <div className="text-xs text-white/40 truncate">
                      {c.customer?.name ?? "—"}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                  <PriorityBadge priority={c.priority} />
                </a>
              </Link>
            ))}
            {last5Cases.length === 0 && (
              <div className="text-xs text-white/40 py-6 text-center">No cases yet.</div>
            )}
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Open tasks</h2>
            <Link href="/cases">
              <a className="text-xs text-[var(--color-primary)] inline-flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </a>
            </Link>
          </div>
          <div className="space-y-1.5">
            {openTasks.map((t) => (
              <Link key={t.id} href={`/cases/${t.caseId}#tasks`}>
                <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="size-2 rounded-full bg-[var(--color-primary)]/60" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-white/40">
                      Due {formatDate(t.dueDate)}
                    </div>
                  </div>
                  <TaskStatusBadge status={t.status} />
                </a>
              </Link>
            ))}
            {openTasks.length === 0 && (
              <div className="text-xs text-white/40 py-6 text-center">All caught up.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div
      className={cn(
        "glass-panel p-4 relative overflow-hidden hover:brightness-110 transition-all",
        "before:absolute before:top-0 before:left-0 before:right-0 before:h-px",
      )}
      style={{ boxShadow: `inset 0 1px 0 ${color}66` }}
    >
      <div
        className="absolute -top-10 -right-10 size-24 rounded-full opacity-20 blur-3xl"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="label-eyebrow">{label}</div>
          <div className="text-2xl font-bold tracking-tight mt-1.5">{value}</div>
        </div>
        <div
          className="size-8 rounded-lg grid place-items-center"
          style={{ background: `${color}1f`, color }}
        >
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-white/60">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
