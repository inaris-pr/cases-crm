import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Clock, TrendingUp, Trophy, Smile } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { CaseWithCustomer, Stats } from "@/lib/api";
import { cn } from "@/lib/cn";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  intake: "#3b82f6",
  review: "#a855f7",
  in_progress: "#29f312",
  waiting: "#f59e0b",
  completed: "#ef4444",
};

type Range = "7d" | "30d" | "90d";

export function Insights() {
  const [range, setRange] = useState<Range>("30d");
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => fetchJson<Stats>(API("/api/stats")) });
  const cases = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchJson<CaseWithCustomer[]>(API("/api/cases")),
  });

  const trend = useMemo(() => {
    const all = stats.data?.trend30 ?? [];
    if (range === "7d") return all.slice(-7);
    if (range === "90d") {
      // We only have 30d on the backend, so we extend by zero-padding for demo.
      const pad = Array.from({ length: 60 }, (_, i) => ({
        date: `…-${i}`,
        cases: 0,
        tasks: 0,
      }));
      return [...pad, ...all];
    }
    return all;
  }, [stats.data, range]);

  const totalCases = cases.data?.length ?? 0;
  const completedCases = (cases.data ?? []).filter((c) => c.status === "completed");
  const avgResolutionDays = completedCases.length
    ? Math.round(
        completedCases
          .map((c) => +new Date(c.updatedAt) - +new Date(c.createdAt))
          .reduce((a, b) => a + b, 0) /
          completedCases.length /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  const statusPie = (stats.data?.statusBreakdown ?? []).map((s) => ({
    name: s.status,
    value: s.count,
    color: STATUS_COLOR[s.status],
  }));

  const priorityCounts: Record<string, number> = {};
  for (const c of cases.data ?? []) {
    priorityCounts[c.priority] = (priorityCounts[c.priority] ?? 0) + 1;
  }
  const priorityRows = Object.entries(priorityCounts).map(([priority, count]) => ({
    priority,
    count,
  }));

  // Top customers
  const customerCounts: Record<string, number> = {};
  for (const c of cases.data ?? []) {
    if (c.customer)
      customerCounts[c.customer.name] = (customerCounts[c.customer.name] ?? 0) + 1;
  }
  const topCustomers = Object.entries(customerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCustomer = Math.max(1, ...topCustomers.map(([, n]) => n));

  // Funnel
  const stages = ["intake", "review", "in_progress", "waiting", "completed"] as const;
  const funnel = stages.map((s) => ({
    stage: s,
    count: (stats.data?.statusBreakdown ?? []).find((r) => r.status === s)?.count ?? 0,
  }));

  // Sortable cases table
  const [sortKey, setSortKey] = useState<"resolution" | "createdAt" | "title">("resolution");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const tableRows = useMemo(() => {
    const rows = (cases.data ?? []).map((c) => ({
      ...c,
      resolutionDays: Math.round(
        (+new Date(c.updatedAt) - +new Date(c.createdAt)) / (1000 * 60 * 60 * 24),
      ),
    }));
    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "resolution") return (a.resolutionDays - b.resolutionDays) * dir;
      if (sortKey === "createdAt")
        return (+new Date(a.createdAt) - +new Date(b.createdAt)) * dir;
      return a.title.localeCompare(b.title) * dir;
    });
    return rows;
  }, [cases.data, sortKey, sortDir]);

  function setSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Analytics</div>
          <h1 className="text-xl font-bold tracking-tight">Insights</h1>
        </div>
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 text-xs border border-white/10">
          {(["7d", "30d", "90d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 rounded-md transition",
                range === r ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold" : "text-white/60",
              )}
            >
              Last {r === "7d" ? "7" : r === "30d" ? "30" : "90"} days
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Avg resolution" value={`${avgResolutionDays}d`} icon={Clock} color="#3b82f6" />
        <Kpi
          label="Case volume"
          value={String(totalCases)}
          delta="+12%"
          deltaPositive
          icon={TrendingUp}
          color="#29f312"
        />
        <Kpi label="Top priority" value="High" icon={Trophy} color="#f59e0b" />
        <Kpi label="Customer CSAT" value="4.7 / 5" icon={Smile} color="#a855f7" />
      </div>

      {/* Row 2: charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-panel p-4 xl:col-span-2">
          <h2 className="text-base font-semibold mb-3">Case volume over time</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="gInsight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#29f312" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#29f312" stopOpacity={0} />
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
                <Area dataKey="cases" stroke="#29f312" fill="url(#gInsight)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-4">
          <h2 className="text-base font-semibold mb-3">Cases by status</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {statusPie.map((row, i) => (
                    <Cell key={i} fill={row.color} stroke="rgba(0,0,0,0.4)" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(20,20,25,0.9)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2 text-[11px]">
            {statusPie.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-white/60">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="capitalize">{s.name.replace("_", " ")}</span>
                <span className="ml-auto tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-4 xl:col-span-3">
          <h2 className="text-base font-semibold mb-3">Cases by priority</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityRows} layout="vertical">
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="priority" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(20,20,25,0.9)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#29f312" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <h2 className="text-base font-semibold mb-4">Top customers</h2>
          <div className="space-y-2.5">
            {topCustomers.map(([name, n], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs text-white/40 w-5">#{i + 1}</span>
                <span className="text-sm flex-1 truncate">{name}</span>
                <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary)] rounded-full"
                    style={{ width: `${(n / maxCustomer) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-white/60 tabular-nums w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-4">
          <h2 className="text-base font-semibold mb-4">Resolution funnel</h2>
          <div className="space-y-3">
            {funnel.map((f, i) => {
              const pct = funnel[0].count ? (f.count / funnel[0].count) * 100 : 0;
              return (
                <div key={f.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="capitalize text-white/70">{f.stage.replace("_", " ")}</span>
                    <span className="text-white/40">{Math.round(pct)}% · {f.count}</span>
                  </div>
                  <div
                    className="h-6 rounded-md"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${STATUS_COLOR[f.stage]}aa, ${STATUS_COLOR[f.stage]}55)`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 4: sortable */}
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5">Case #</th>
              <SortableTh active={sortKey === "title"} dir={sortDir} onClick={() => setSort("title")}>
                Title
              </SortableTh>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Priority</th>
              <SortableTh active={sortKey === "createdAt"} dir={sortDir} onClick={() => setSort("createdAt")}>
                Created
              </SortableTh>
              <SortableTh active={sortKey === "resolution"} dir={sortDir} onClick={() => setSort("resolution")}>
                Resolution
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b border-white/5">
                  <td className="px-5 py-3 font-mono text-xs text-white/50">{r.caseNumber}</td>
                  <td className="px-3 py-3">{r.title}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-3">
                    <PriorityBadge priority={r.priority} />
                  </td>
                  <td className="px-3 py-3 text-xs text-white/50">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-3 text-xs tabular-nums">{r.resolutionDays}d</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  color,
  delta,
  deltaPositive,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
  delta?: string;
  deltaPositive?: boolean;
}) {
  return (
    <div className="glass-panel p-3 relative overflow-hidden">
      <div
        className="absolute -top-8 -right-8 size-20 rounded-full opacity-20 blur-3xl"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="label-eyebrow">{label}</div>
          <div className="text-lg font-bold mt-1">{value}</div>
        </div>
        <div className="size-8 rounded-lg grid place-items-center" style={{ background: `${color}1f`, color }}>
          <Icon size={14} />
        </div>
      </div>
      {delta && (
        <div className={cn("mt-2 text-xs inline-flex items-center gap-1 font-semibold", deltaPositive ? "text-emerald-400" : "text-rose-400")}>
          {deltaPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          {delta}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  children,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "px-3 py-3 font-medium cursor-pointer select-none",
        active ? "text-white" : "hover:text-white/70",
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
}
