/**
 * The Dashboard widget registry (RBAC Phase 6).
 *
 * Every widget declares the permissions it needs (all of them, with an
 * optional minimum scope) in DASHBOARD_WIDGETS (lib/access/src/dashboard.ts). The Dashboard renders exactly the widgets the
 * signed-in employee's effective permissions satisfy — decided before any
 * request, so a widget never appears and then vanishes on a 403. Several
 * roles simply mean more permissions, so the union of widgets.
 *
 * The data for every widget comes from one request, GET /api/dashboard,
 * whose sections the server includes under the same permissions and
 * computes over the records inside the employee's scope. Nothing here
 * invents or estimates a figure.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import {
  AlarmClock,
  Building2,
  CheckCircle2,
  Flame,
  FolderKanban,
  ListTodo,
  Network,
  PhoneCall,
  Target,
  UserCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { can, dashboardWidgetAllowed, type DashboardWidgetId, type EffectivePermissions } from "@cases/access";
import type { CasePriority, CaseStatus, DashboardData, LeadStatus } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  Bars,
  CaseRow,
  EmptyLine,
  Panel,
  SCOPE_LABEL,
  StatCard,
  StatRow,
  ViewAll,
  activitySourceLabel,
  age,
  ago,
} from "./parts";
import { recordsPath } from "@/lib/records";

export interface WidgetContext {
  permissions: EffectivePermissions;
  userName: string | undefined;
}

export interface DashboardWidget {
  /** Its permissions are in DASHBOARD_WIDGETS (lib/access). */
  id: DashboardWidgetId;
  /** Used in loading and error states. */
  title: string;
  /** stats = a row of stat cards; wide = full width; otherwise half width on large screens. */
  layout: "stats" | "wide" | "half";
  render(data: DashboardData, ctx: WidgetContext): ReactNode;
}

export function widgetAllowed(w: DashboardWidget, permissions: EffectivePermissions): boolean {
  return dashboardWidgetAllowed(permissions, w.id);
}

const STATUS_LABEL: Record<CaseStatus, string> = {
  intake: "Intake",
  review: "Review",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
};
const STATUS_COLOR: Record<CaseStatus, string> = {
  intake: "#3b82f6",
  review: "#a855f7",
  in_progress: "#29f312",
  waiting: "#f59e0b",
  completed: "#ef4444",
};
const PRIORITY_COLOR: Record<CasePriority, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#64748b",
};
const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  working: "Working",
  qualified: "Qualified",
  unqualified: "Unqualified",
  converted: "Converted",
};
const LEAD_COLOR: Record<LeadStatus, string> = {
  new: "#3b82f6",
  working: "#a855f7",
  qualified: "#29f312",
  unqualified: "#64748b",
  converted: "#10b981",
};
const REASON_LABEL = {
  critical_priority: "Critical priority",
  high_priority: "High priority",
  overdue_tasks: "Overdue tasks",
} as const;

const caseScopeText = { own: "Cases you own", team: "You and the team you supervise", all: "All cases" } as const;
const leadScopeText = { own: "Leads you own", team: "You and the advisors you supervise", all: "All leads" } as const;


function Unavailable() {
  return <EmptyLine>Not available.</EmptyLine>;
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`py-2 px-2 font-medium text-[10px] uppercase tracking-widest text-white/40 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, strong }: { children: ReactNode; right?: boolean; strong?: boolean }) {
  return (
    <td className={`py-2 px-2 ${right ? "text-right tabular-nums" : ""} ${strong ? "font-semibold" : "text-white/80"}`}>
      {children}
    </td>
  );
}

export const WIDGETS: readonly DashboardWidget[] = [
  // ── Headline figures ──────────────────────────────────────────────────────
  {
    id: "case-summary",
    title: "Case summary",
    layout: "stats",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      const s = cases.summary;
      const scope = SCOPE_LABEL[cases.scope];
      return (
        <StatRow cols={5}>
          <StatCard testId="stat-open-cases" color="#3b82f6" label="Open cases" value={s.open} hint={scope} icon={FolderKanban} />
          <StatCard testId="stat-urgent-cases" color="#ef4444" label="High / critical" value={s.urgentOpen} hint="Open cases" icon={Flame} />
          <StatCard testId="stat-open-tasks" color="#f59e0b" label="Open tasks" value={s.openTasks} hint="On these cases" icon={ListTodo} />
          <StatCard testId="stat-overdue-tasks" color="#f97316" label="Overdue tasks" value={s.overdueTasks} hint="Past due, not completed" icon={AlarmClock} />
          <StatCard testId="stat-completed-cases" color="#10b981" label="Completed" value={s.completed} hint={scope} icon={CheckCircle2} />
        </StatRow>
      );
    },
  },
  {
    id: "lead-summary",
    title: "Lead summary",
    layout: "stats",
    render: ({ leads, accounts }) => {
      if (!leads) return <Unavailable />;
      const qualified = leads.byStatus.find((s) => s.status === "qualified")?.count ?? 0;
      const scope = SCOPE_LABEL[leads.scope];
      return (
        <StatRow cols={4}>
          <StatCard testId="stat-active-leads" color="#29f312" label="Active leads" value={leads.summary.active} hint="New, working or qualified" icon={Target} />
          <StatCard testId="stat-qualified-leads" color="#a855f7" label="Qualified" value={qualified} hint={scope} icon={UserCheck} />
          <StatCard testId="stat-total-leads" color="#3b82f6" label="All leads" value={leads.summary.total} hint={scope} icon={Users} />
          {accounts ? (
            <StatCard
              testId="stat-owned-accounts"
              color="#10b981"
              label={accounts.scope === "all" ? "Accounts" : "Accounts owned"}
              value={accounts.owned}
              hint={SCOPE_LABEL[accounts.scope]}
              icon={Building2}
            />
          ) : null}
        </StatRow>
      );
    },
  },
  {
    id: "people-summary",
    title: "People summary",
    layout: "stats",
    render: ({ people }) => {
      if (!people) return <Unavailable />;
      return (
        <StatRow cols={4}>
          <StatCard testId="stat-active-employees" color="#29f312" label="Active employees" value={people.activeEmployees} icon={Users} />
          <StatCard testId="stat-departments" color="#3b82f6" label="Departments" value={people.byDepartment.filter((d) => d.key !== null).length} hint="With active employees" icon={Building2} />
          <StatCard testId="stat-teams" color="#a855f7" label="Teams" value={people.teams.length} icon={Network} />
          <StatCard testId="stat-inactive-employees" color="#64748b" label="Inactive" value={people.inactiveEmployees} hint="Deactivated accounts" icon={UsersRound} />
        </StatRow>
      );
    },
  },

  // ── Cases ─────────────────────────────────────────────────────────────────
  {
    id: "case-attention",
    title: "Needs attention",
    layout: "half",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      return (
        <Panel title="Needs attention" subtitle="Open cases that are high / critical priority or have overdue tasks">
          <div className="space-y-1.5">
            {cases.attention.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                detail={
                  <>
                    {(c.reasons ?? []).map((r) => REASON_LABEL[r]).join(" · ")}
                    {c.overdueTasks > 0 ? ` (${c.overdueTasks})` : ""}
                    {cases.scope !== "own" ? ` · ${c.ownerName}` : ""}
                  </>
                }
              />
            ))}
            {cases.attention.length === 0 && <EmptyLine>Nothing urgent and no overdue tasks.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "case-least-recent",
    title: "Least recently worked",
    layout: "half",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      return (
        <Panel title="Least recently worked" subtitle="Open cases, oldest recorded activity first">
          <div className="space-y-1.5">
            {cases.leastRecentlyWorked.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                detail={
                  <>
                    <span data-testid="case-age">{age(c.lastActivityAt)}</span> since last activity (
                    {activitySourceLabel(c.lastActivitySource)}){cases.scope !== "own" ? ` · ${c.ownerName}` : ""}
                  </>
                }
              />
            ))}
            {cases.leastRecentlyWorked.length === 0 && <EmptyLine>No open cases.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "case-workload",
    title: "Team workload",
    layout: "wide",
    render: ({ cases }) => {
      if (!cases?.workload) return <Unavailable />;
      return (
        <Panel
          title={cases.scope === "all" ? "Workload by owner" : "Team workload"}
          subtitle="Open cases per case owner. Tasks have no assignee, so they count toward the owner of their case."
        >
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-white/5">
                  <Th>Employee</Th>
                  <Th right>Open cases</Th>
                  <Th right>High / critical</Th>
                  <Th right>Open tasks</Th>
                  <Th right>Overdue tasks</Th>
                </tr>
              </thead>
              <tbody>
                {cases.workload.map((r) => (
                  <tr key={r.userId ?? "none"} className="border-b border-white/[0.03]" data-testid={`workload-row-${r.userId ?? "none"}`}>
                    <Td strong>
                      {r.name}
                      {!r.active && r.userId !== null && <span className="ml-2 text-[10px] text-white/40">inactive</span>}
                    </Td>
                    <Td right>{r.openCases}</Td>
                    <Td right>{r.urgentCases}</Td>
                    <Td right>{r.openTasks}</Td>
                    <Td right>{r.overdueTasks}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cases.workload.length === 0 && <EmptyLine>No team members yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "case-breakdown",
    title: "Case breakdown",
    layout: "half",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      return (
        <Panel title="Case breakdown" subtitle={`${caseScopeText[cases.scope]} · status (all) and priority (open)`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="label-eyebrow mb-2">By status</div>
              <Bars rows={cases.byStatus.map((s) => ({ key: `status-${s.status}`, label: STATUS_LABEL[s.status], count: s.count, color: STATUS_COLOR[s.status] }))} />
            </div>
            <div>
              <div className="label-eyebrow mb-2">Open by priority</div>
              <Bars rows={cases.byPriority.map((p) => ({ key: `priority-${p.priority}`, label: p.priority, count: p.count, color: PRIORITY_COLOR[p.priority] }))} />
            </div>
          </div>
        </Panel>
      );
    },
  },
  {
    id: "case-recent",
    title: "Recent cases",
    layout: "half",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      return (
        <Panel title="Recent cases" subtitle="Most recent activity first" action={<ViewAll href={recordsPath("cases")} />}>
          <div className="space-y-1.5">
            {cases.recent.map((c) => (
              <CaseRow key={c.id} c={c} detail={`${ago(c.lastActivityAt)} · ${activitySourceLabel(c.lastActivitySource)}${cases.scope !== "own" ? ` · ${c.ownerName}` : ""}`} />
            ))}
            {cases.recent.length === 0 && <EmptyLine>No cases yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "case-activity",
    title: "Recent case activity",
    layout: "half",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      const kind = { call_log: "Call / contact", comment: "Comment", task: "Task", document: "Document" } as const;
      return (
        <Panel title="Recent case activity" subtitle="Calls, comments, tasks and documents on these cases">
          <div className="space-y-1.5">
            {cases.recentActivity.map((a, i) => (
              <Link key={`${a.kind}-${a.caseId}-${a.at}-${i}`} href={`/cases/${a.caseId}`} className="block px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-2 text-[11px] text-white/40">
                  <span className="font-mono">{a.caseNumber}</span>
                  <span>·</span>
                  <span>{kind[a.kind]}</span>
                  {a.byName && <span>· {a.byName}</span>}
                  <span className="ml-auto shrink-0">{ago(a.at)}</span>
                </div>
                <div className="text-sm truncate">{a.text}</div>
              </Link>
            ))}
            {cases.recentActivity.length === 0 && <EmptyLine>No activity recorded yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "case-trend",
    title: "Case & task volume",
    layout: "half",
    render: ({ cases }) => {
      if (!cases) return <Unavailable />;
      return (
        <Panel title="Case & task volume" subtitle="Created per day, last 30 days">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cases.trend30}>
                <defs>
                  <linearGradient id="dCases" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#29f312" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#29f312" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} tickFormatter={(s: string) => s.slice(5)} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "rgba(20,20,25,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }} />
                <Area dataKey="cases" name="Cases" stroke="#29f312" fill="url(#dCases)" strokeWidth={2} />
                <Area dataKey="tasks" name="Tasks" stroke="#3b82f6" fill="url(#dTasks)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      );
    },
  },
  {
    id: "calls",
    title: "Calls & contacts logged",
    layout: "half",
    render: ({ calls }) => {
      if (!calls) return <Unavailable />;
      const who = { own: "Logged by you", team: "Logged by you and your team", all: "Logged by anyone" }[calls.scope];
      return (
        <Panel title="Calls & contacts logged" subtitle={`${who} on cases (manual logs — no phone system is connected)`}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass-soft p-3">
              <div className="label-eyebrow">Last 7 days</div>
              <div className="text-xl font-bold mt-1" data-testid="calls-7d">{calls.last7Days}</div>
            </div>
            <div className="glass-soft p-3">
              <div className="label-eyebrow">Last 30 days</div>
              <div className="text-xl font-bold mt-1" data-testid="calls-30d">{calls.last30Days}</div>
            </div>
          </div>
          <div className="label-eyebrow mb-2">By channel · 30 days</div>
          <Bars rows={calls.byChannel30.map((c) => ({ key: `channel-${c.channel}`, label: c.channel, count: c.count }))} />
          <div className="label-eyebrow mt-4 mb-2">Latest</div>
          <div className="space-y-1">
            {calls.recent.map((x) => (
              <Link key={x.id} href={`/cases/${x.caseId}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs">
                <PhoneCall size={12} className="text-white/40 shrink-0" />
                <span className="font-mono text-white/40">{x.caseNumber}</span>
                <span className="truncate flex-1">
                  {x.direction} {x.channel} · {x.contact}
                  {calls.scope !== "own" ? ` · ${x.byName}` : ""}
                </span>
                <span className="text-white/40 shrink-0">{ago(x.createdAt)}</span>
              </Link>
            ))}
            {calls.recent.length === 0 && <EmptyLine>No calls or contacts logged yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },

  // ── Leads and accounts ────────────────────────────────────────────────────
  {
    id: "lead-pipeline",
    title: "Leads by status",
    layout: "half",
    render: ({ leads }) => {
      if (!leads) return <Unavailable />;
      return (
        <Panel title="Leads by status" subtitle={`${leadScopeText[leads.scope]} · current status of each lead`}>
          <Bars rows={leads.byStatus.map((s) => ({ key: `lead-${s.status}`, label: LEAD_STATUS_LABEL[s.status], count: s.count, color: LEAD_COLOR[s.status] }))} />
        </Panel>
      );
    },
  },
  {
    id: "lead-recent",
    title: "Recent leads",
    layout: "half",
    render: ({ leads }) => {
      if (!leads) return <Unavailable />;
      return (
        <Panel title="Recent leads" subtitle="Most recently updated" action={<ViewAll href="/leads" />}>
          <div className="space-y-1.5">
            {leads.recent.map((l) => (
              <Link key={l.id} href="/leads" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.name}</div>
                  <div className="text-xs text-white/40 truncate">
                    {l.companyName ?? "—"}
                    {leads.scope !== "own" ? ` · ${l.ownerName}` : ""} · {ago(l.updatedAt)}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-white/50">{LEAD_STATUS_LABEL[l.status]}</span>
              </Link>
            ))}
            {leads.recent.length === 0 && <EmptyLine>No leads yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "lead-workload",
    title: "Leads by advisor",
    layout: "wide",
    render: ({ leads }) => {
      if (!leads?.workload) return <Unavailable />;
      const statuses: LeadStatus[] = ["new", "working", "qualified", "unqualified", "converted"];
      return (
        <Panel title="Leads by advisor" subtitle="Current status of the leads each advisor owns (not a conversion history)">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-white/5">
                  <Th>Advisor</Th>
                  <Th right>Active</Th>
                  {statuses.map((s) => (
                    <Th key={s} right>{LEAD_STATUS_LABEL[s]}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.workload.map((r) => (
                  <tr key={r.userId ?? "none"} className="border-b border-white/[0.03]" data-testid={`lead-row-${r.userId ?? "none"}`}>
                    <Td strong>{r.name}</Td>
                    <Td right>{r.activeLeads}</Td>
                    {statuses.map((s) => (
                      <Td key={s} right>{r.byStatus[s]}</Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      );
    },
  },
  {
    id: "accounts",
    title: "Accounts",
    layout: "half",
    render: ({ accounts }) => {
      if (!accounts) return <Unavailable />;
      const title = { own: "My accounts", team: "Team accounts", all: "Accounts" }[accounts.scope];
      return (
        <Panel title={title} subtitle={accounts.scope === "all" ? "All accounts" : "Accounts owned in your scope"} action={<ViewAll href={recordsPath("accounts")} />}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass-soft p-3">
              <div className="label-eyebrow">{accounts.scope === "all" ? "Accounts" : "Owned"}</div>
              <div className="text-xl font-bold mt-1" data-testid="accounts-owned">{accounts.owned}</div>
            </div>
            <div className="glass-soft p-3">
              <div className="label-eyebrow">{accounts.totalClients !== undefined ? "Clients" : "Linked clients"}</div>
              <div className="text-xl font-bold mt-1" data-testid="accounts-clients">
                {accounts.totalClients ?? accounts.linkedClients}
              </div>
            </div>
          </div>
          {accounts.byOwner && accounts.byOwner.length > 0 && (
            <>
              <div className="label-eyebrow mb-2">By owner</div>
              <Bars rows={accounts.byOwner.map((o) => ({ key: `owner-${o.userId ?? "none"}`, label: o.name, count: o.count }))} />
              <div className="h-4" />
            </>
          )}
          <div className="label-eyebrow mb-2">Newest</div>
          <div className="space-y-1">
            {accounts.recent.map((a) => (
              <Link key={a.id} href={`/accounts/${a.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs">
                <Building2 size={12} className="text-white/40 shrink-0" />
                <span className="truncate flex-1">{a.name}</span>
                <span className="text-white/40 shrink-0">{formatDate(a.createdAt)}</span>
              </Link>
            ))}
            {accounts.recent.length === 0 && <EmptyLine>No accounts in your scope.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },

  // ── People (employee data only) ───────────────────────────────────────────
  {
    id: "people-distribution",
    title: "Employees",
    layout: "half",
    render: ({ people }) => {
      if (!people) return <Unavailable />;
      return (
        <Panel title="Employees" subtitle="Active employees by department and by role">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="label-eyebrow mb-2">By department</div>
              <Bars rows={people.byDepartment.map((d) => ({ key: `dept-${d.key ?? "none"}`, label: d.label, count: d.count }))} />
            </div>
            <div>
              <div className="label-eyebrow mb-2">By role</div>
              <Bars rows={people.byRole.map((r) => ({ key: `role-${r.key}`, label: r.label, count: r.count }))} color="#a855f7" />
            </div>
          </div>
        </Panel>
      );
    },
  },
  {
    id: "people-teams",
    title: "Teams",
    layout: "half",
    render: ({ people }) => {
      if (!people) return <Unavailable />;
      return (
        <Panel title="Teams" subtitle="Supervisors and members">
          <div className="space-y-2">
            {people.teams.map((t) => (
              <div key={t.id} className="glass-soft p-3" data-testid={`team-${t.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold truncate">{t.name}</div>
                  <span className="text-[10px] text-white/40 shrink-0">
                    {t.members.length} member{t.members.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="text-[11px] text-white/40">{t.departmentLabel}</div>
                <div className="text-xs text-white/70 mt-1.5">
                  <span className="text-white/40">Supervised by </span>
                  {t.supervisors.map((s) => s.name).join(", ") || "—"}
                </div>
                <div className="text-xs text-white/70 truncate">
                  <span className="text-white/40">Members </span>
                  {t.members.map((m) => m.name).join(", ") || "—"}
                </div>
              </div>
            ))}
            {people.teams.length === 0 && <EmptyLine>No teams yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },

  // ── Communication ─────────────────────────────────────────────────────────
  {
    id: "mentions",
    title: "Mentions",
    layout: "half",
    render: ({ communication }, { permissions }) => {
      if (!communication) return <Unavailable />;
      const linkToCase = can(permissions, "cases.view");
      return (
        <Panel
          title="Mentions"
          subtitle={`${communication.unreadMentions} unread`}
        >
          <div className="space-y-1.5">
            {communication.mentions.map((m) => {
              const body = (
                <>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    {!m.readAt && <span className="size-1.5 rounded-full bg-[var(--color-primary)]" />}
                    <span>{m.fromName}</span>
                    {m.caseNumber && <span className="font-mono text-white/30">{m.caseNumber}</span>}
                    <span className="ml-auto">{ago(m.createdAt)}</span>
                  </div>
                  <div className="text-sm truncate">{m.body}</div>
                </>
              );
              return linkToCase && m.caseNumber ? (
                <Link key={m.id} href={`/cases/${m.caseId}`} className="block px-3 py-2.5 rounded-lg hover:bg-white/5">{body}</Link>
              ) : (
                <div key={m.id} className="px-3 py-2.5 rounded-lg bg-white/[0.02]">{body}</div>
              );
            })}
            {communication.mentions.length === 0 && <EmptyLine>No mentions.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
  {
    id: "conversations",
    title: "Conversations",
    layout: "half",
    render: ({ communication }, { userName }) => {
      if (!communication) return <Unavailable />;
      return (
        <Panel title="Conversations" subtitle="Your latest conversations" action={<ViewAll href="/messages" label="Open messages" />}>
          <div className="space-y-1.5">
            {communication.conversations.map((c) => (
              <Link key={c.id} href="/messages" className="block px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium truncate flex-1">
                    {c.name ?? (c.members.filter((n) => n !== userName).join(", ") || "Conversation")}
                  </div>
                  {c.lastMessageAt && <span className="text-[11px] text-white/40 shrink-0">{ago(c.lastMessageAt)}</span>}
                </div>
                <div className="text-xs text-white/40 truncate">{c.lastMessage ?? "No messages yet"}</div>
              </Link>
            ))}
            {communication.conversations.length === 0 && <EmptyLine>No conversations yet.</EmptyLine>}
          </div>
        </Panel>
      );
    },
  },
];
