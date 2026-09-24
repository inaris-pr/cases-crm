/**
 * The personalized Dashboard (RBAC Phase 6): GET /api/dashboard.
 *
 * One response, computed on the server, made of independent sections. A
 * section is present ONLY if the caller's effective permissions allow it
 * (DASHBOARD_SECTION_REQUIREMENTS in lib/access, which the web app's widgets
 * also use),
 * and every number in it is computed over records inside the caller's scope
 * for the matching permission (own / team / all, by stable owner ids and
 * the teams they currently supervise). Nothing here is estimated: every
 * figure is a count of stored records (see the data audit in
 * CLAUDE_HANDOFF.md). The browser never downloads rows it could not
 * otherwise read just to compute a number.
 *
 *   cases          metrics.cases + cases.view   (scope: metrics.cases)
 *   calls          metrics.calls + cases.view   (scope: metrics.calls, by who logged)
 *   leads          metrics.sales + leads.view   (scope: metrics.sales)
 *   accounts       accounts.view + metrics.sales (scope: metrics.sales, by account owner)
 *   people         metrics.people + people.view (employees and teams only — no customer data)
 *   communication  messages.use                 (your own mentions and conversations)
 */
import {
  DEPARTMENT_LABELS,
  ROLE_LABELS,
  can,
  dashboardSectionAllowed,
  resolvePermissions,
  scopeOf,
  type DepartmentKey,
  type Permission,
  type RoleKey,
  type Scope,
} from "./access.js";
import { canOn, ownerInScope, type Principal } from "./auth/authorize.js";
import { lastActivityIndex, type ActivitySource } from "./caseActivity.js";
import type {
  Case,
  CasePriority,
  CaseStatus,
  ContactChannel,
  Lead,
  LeadStatus,
  User,
  store as StoreT,
} from "./store.js";

type Store = typeof StoreT;

const CASE_STATUSES: CaseStatus[] = ["intake", "review", "in_progress", "waiting", "completed"];
const CASE_PRIORITIES: CasePriority[] = ["critical", "high", "medium", "low"];
const LEAD_STATUSES: LeadStatus[] = ["new", "working", "qualified", "unqualified", "converted"];
const CHANNELS: ContactChannel[] = ["phone", "email", "sms", "meeting", "other"];
/** Leads still being worked (not converted, not disqualified). */
const ACTIVE_LEAD = (l: Lead) => l.status !== "converted" && l.status !== "unqualified";
const OPEN_CASE = (c: Case) => c.status !== "completed";
const URGENT = (p: CasePriority) => p === "high" || p === "critical";
const LIST = 6;

// ── Response types (duplicated in artifacts/cases/src/lib/api.ts) ───────────

export interface DashboardCaseItem {
  id: number;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  ownerUserId: number | null;
  ownerName: string;
  openTasks: number;
  overdueTasks: number;
  lastActivityAt: string;
  lastActivitySource: ActivitySource;
  /** Why the case is in the attention list. */
  reasons?: ("critical_priority" | "high_priority" | "overdue_tasks")[];
}

export interface CaseWorkloadRow {
  userId: number | null;
  name: string;
  active: boolean;
  openCases: number;
  urgentCases: number;
  /** Tasks have no assignee: counted on the owner of their Case. */
  openTasks: number;
  overdueTasks: number;
}

export interface DashboardCases {
  scope: Scope;
  summary: { open: number; completed: number; urgentOpen: number; openTasks: number; overdueTasks: number };
  byStatus: { status: CaseStatus; count: number }[];
  /** Open cases only. */
  byPriority: { priority: CasePriority; count: number }[];
  /** Cases and tasks CREATED per UTC day, last 30 days. */
  trend30: { date: string; cases: number; tasks: number }[];
  recent: DashboardCaseItem[];
  attention: DashboardCaseItem[];
  leastRecentlyWorked: DashboardCaseItem[];
  recentActivity: {
    kind: "call_log" | "comment" | "task" | "document";
    caseId: number;
    caseNumber: string;
    at: string;
    byName: string | null;
    text: string;
  }[];
  /** Per employee — team and all scope only. */
  workload?: CaseWorkloadRow[];
}

export interface DashboardCalls {
  scope: Scope;
  last7Days: number;
  last30Days: number;
  byChannel30: { channel: ContactChannel; count: number }[];
  recent: { id: number; caseId: number; caseNumber: string; channel: ContactChannel; direction: string; contact: string; byName: string; createdAt: string }[];
}

export interface LeadWorkloadRow {
  userId: number | null;
  name: string;
  active: boolean;
  activeLeads: number;
  totalLeads: number;
  byStatus: Record<LeadStatus, number>;
}

export interface DashboardLeads {
  scope: Scope;
  summary: { active: number; total: number };
  /** Current status of each lead in scope (not a conversion history). */
  byStatus: { status: LeadStatus; count: number }[];
  recent: { id: number; name: string; companyName: string | null; status: LeadStatus; ownerUserId: number | null; ownerName: string; updatedAt: string }[];
  workload?: LeadWorkloadRow[];
}

export interface DashboardAccounts {
  scope: Scope;
  /** Accounts owned inside the scope (mine / my team / all). */
  owned: number;
  /** Distinct clients actively linked to those accounts. */
  linkedClients: number;
  /** All clients the caller may view — "all" scope only. */
  totalClients?: number;
  recent: { id: number; name: string; ownerName: string; createdAt: string }[];
  byOwner?: { userId: number | null; name: string; count: number }[];
}

export interface DashboardPeople {
  scope: Scope;
  activeEmployees: number;
  inactiveEmployees: number;
  byDepartment: { key: DepartmentKey | null; label: string; count: number }[];
  byRole: { key: RoleKey; label: string; count: number }[];
  teams: {
    id: number;
    name: string;
    departmentLabel: string;
    supervisors: { id: number; name: string }[];
    members: { id: number; name: string; roles: string[]; active: boolean }[];
  }[];
}

export interface DashboardCommunication {
  unreadMentions: number;
  mentions: { id: number; fromName: string; body: string; caseId: number; caseNumber: string | null; readAt: string | null; createdAt: string }[];
  conversations: { id: number; name: string | null; type: string; members: string[]; lastMessage: string | null; lastMessageAt: string | null }[];
}

export interface DashboardResponse {
  generatedAt: string;
  cases?: DashboardCases;
  calls?: DashboardCalls;
  leads?: DashboardLeads;
  accounts?: DashboardAccounts;
  people?: DashboardPeople;
  communication?: DashboardCommunication;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const trim = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const userName = (store: Store, id: number | null, fallback: string) =>
  (id == null ? undefined : store.users.find((u) => u.id === id)?.name) ?? fallback;

function isOverdue(t: { status: string; dueDate: string | null }, now: number): boolean {
  if (t.status === "completed" || !t.dueDate) return false;
  const due = Date.parse(t.dueDate);
  return Number.isFinite(due) && due < now;
}

/** The employees a team/all workload lists: team = me + supervised members; all = active holders of `mustHold` plus any owner in scope. */
function workloadPeople(p: Principal, store: Store, scope: Scope, mustHold: Permission, ownerIds: (number | null)[]): User[] {
  const ids = new Set<number>();
  if (scope === "team") {
    ids.add(p.user.id);
    for (const id of p.supervisedUserIds) ids.add(id);
  } else {
    for (const u of store.users) if (u.active && can(resolvePermissions(u.roles), mustHold)) ids.add(u.id);
  }
  for (const id of ownerIds) if (id != null && (scope === "all" || ids.has(id))) ids.add(id);
  return store.users.filter((u) => ids.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Sections ────────────────────────────────────────────────────────────────

function casesSection(p: Principal, store: Store, now: Date): DashboardCases | undefined {
  if (!dashboardSectionAllowed(p.permissions, "cases")) return undefined;
  const scope = scopeOf(p.permissions, "metrics.cases")!;
  const nowMs = now.getTime();
  // Cases the caller may both view and count (the metrics scope is never wider than view here).
  const cases = store.cases.filter(
    (c) => canOn(p, "metrics.cases", c.ownerUserId) && canOn(p, "cases.view", c.ownerUserId),
  );
  const ids = new Set(cases.map((c) => c.id));
  const tasks = store.tasks.filter((t) => ids.has(t.caseId));
  const activity = lastActivityIndex({
    cases,
    caseInteractions: store.caseInteractions,
    threadEntries: store.threadEntries,
    tasks: store.tasks,
    documents: store.documents,
  });
  const tasksByCase = new Map<number, { open: number; overdue: number }>();
  for (const t of tasks) {
    const e = tasksByCase.get(t.caseId) ?? { open: 0, overdue: 0 };
    if (t.status !== "completed") e.open++;
    if (isOverdue(t, nowMs)) e.overdue++;
    tasksByCase.set(t.caseId, e);
  }
  const item = (c: Case): DashboardCaseItem => {
    const tk = tasksByCase.get(c.id) ?? { open: 0, overdue: 0 };
    const la = activity.get(c.id) ?? { at: c.updatedAt, source: "updated" as const };
    return {
      id: c.id,
      caseNumber: c.caseNumber,
      title: c.title,
      status: c.status,
      priority: c.priority,
      ownerUserId: c.ownerUserId,
      ownerName: userName(store, c.ownerUserId, c.ownerName),
      openTasks: tk.open,
      overdueTasks: tk.overdue,
      lastActivityAt: la.at,
      lastActivitySource: la.source,
    };
  };
  const open = cases.filter(OPEN_CASE);
  const items = open.map(item);
  const byLast = (a: DashboardCaseItem, b: DashboardCaseItem) => Date.parse(a.lastActivityAt) - Date.parse(b.lastActivityAt);
  const prioRank: Record<CasePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const attention = items
    .filter((i) => URGENT(i.priority) || i.overdueTasks > 0)
    .map((i) => ({
      ...i,
      reasons: [
        ...(i.priority === "critical" ? (["critical_priority"] as const) : []),
        ...(i.priority === "high" ? (["high_priority"] as const) : []),
        ...(i.overdueTasks > 0 ? (["overdue_tasks"] as const) : []),
      ],
    }))
    .sort((a, b) => prioRank[a.priority] - prioRank[b.priority] || b.overdueTasks - a.overdueTasks || byLast(a, b))
    .slice(0, LIST);

  const days: DashboardCases["trend30"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      cases: cases.filter((c) => c.createdAt.slice(0, 10) === iso).length,
      tasks: tasks.filter((t) => t.createdAt.slice(0, 10) === iso).length,
    });
  }

  const caseNumber = new Map(cases.map((c) => [c.id, c.caseNumber]));
  const recentActivity: DashboardCases["recentActivity"] = [
    ...store.caseInteractions
      .filter((x) => ids.has(x.caseId))
      .map((x) => ({ kind: "call_log" as const, caseId: x.caseId, at: x.createdAt, byName: userName(store, x.byUserId, x.byName), text: trim(`${x.channel} · ${x.contact}: ${x.summary}`) })),
    ...store.threadEntries
      .filter((x) => ids.has(x.caseId))
      .map((x) => ({ kind: "comment" as const, caseId: x.caseId, at: x.createdAt, byName: userName(store, x.authorUserId, x.authorName), text: trim(x.body) })),
    ...tasks.map((x) => ({ kind: "task" as const, caseId: x.caseId, at: x.createdAt, byName: null, text: trim(x.title) })),
    ...store.documents
      .filter((x) => ids.has(x.caseId))
      .map((x) => ({ kind: "document" as const, caseId: x.caseId, at: x.createdAt, byName: null, text: trim(x.filename) })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8)
    .map((x) => ({ ...x, caseNumber: caseNumber.get(x.caseId) ?? "" }));

  const section: DashboardCases = {
    scope,
    summary: {
      open: open.length,
      completed: cases.length - open.length,
      urgentOpen: open.filter((c) => URGENT(c.priority)).length,
      openTasks: tasks.filter((t) => t.status !== "completed").length,
      overdueTasks: tasks.filter((t) => isOverdue(t, nowMs)).length,
    },
    byStatus: CASE_STATUSES.map((status) => ({ status, count: cases.filter((c) => c.status === status).length })),
    byPriority: CASE_PRIORITIES.map((priority) => ({ priority, count: open.filter((c) => c.priority === priority).length })),
    trend30: days,
    recent: cases.map(item).sort((a, b) => byLast(b, a)).slice(0, LIST),
    attention,
    leastRecentlyWorked: [...items].sort(byLast).slice(0, LIST),
    recentActivity,
  };

  if (scope !== "own") {
    const people = workloadPeople(p, store, scope, "cases.view", cases.map((c) => c.ownerUserId));
    const row = (userId: number | null, name: string, active: boolean): CaseWorkloadRow => {
      const mine = cases.filter((c) => c.ownerUserId === userId);
      const mineOpen = mine.filter(OPEN_CASE);
      const myTasks = mine.flatMap((c) => tasks.filter((t) => t.caseId === c.id));
      return {
        userId,
        name,
        active,
        openCases: mineOpen.length,
        urgentCases: mineOpen.filter((c) => URGENT(c.priority)).length,
        openTasks: myTasks.filter((t) => t.status !== "completed").length,
        overdueTasks: myTasks.filter((t) => isOverdue(t, nowMs)).length,
      };
    };
    section.workload = people.map((u) => row(u.id, u.name, u.active));
    if (scope === "all" && cases.some((c) => c.ownerUserId == null)) section.workload.push(row(null, "No owner", false));
  }
  return section;
}

function callsSection(p: Principal, store: Store, now: Date): DashboardCalls | undefined {
  if (!dashboardSectionAllowed(p.permissions, "calls")) return undefined;
  const scope = scopeOf(p.permissions, "metrics.calls")!;
  const visibleCases = new Map(store.cases.filter((c) => canOn(p, "cases.view", c.ownerUserId)).map((c) => [c.id, c]));
  const logs = store.caseInteractions.filter((x) => visibleCases.has(x.caseId) && canOn(p, "metrics.calls", x.byUserId));
  const since = (days: number) => now.getTime() - days * 86_400_000;
  const in30 = logs.filter((x) => Date.parse(x.createdAt) >= since(30));
  return {
    scope,
    last7Days: logs.filter((x) => Date.parse(x.createdAt) >= since(7)).length,
    last30Days: in30.length,
    byChannel30: CHANNELS.map((channel) => ({ channel, count: in30.filter((x) => x.channel === channel).length })),
    recent: [...logs]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, LIST)
      .map((x) => ({
        id: x.id,
        caseId: x.caseId,
        caseNumber: visibleCases.get(x.caseId)!.caseNumber,
        channel: x.channel,
        direction: x.direction,
        contact: x.contact,
        byName: userName(store, x.byUserId, x.byName),
        createdAt: x.createdAt,
      })),
  };
}

function leadsSection(p: Principal, store: Store): DashboardLeads | undefined {
  if (!dashboardSectionAllowed(p.permissions, "leads")) return undefined;
  const scope = scopeOf(p.permissions, "metrics.sales")!;
  const leads = store.leads.filter((l) => canOn(p, "metrics.sales", l.ownerUserId) && canOn(p, "leads.view", l.ownerUserId));
  const section: DashboardLeads = {
    scope,
    summary: { active: leads.filter(ACTIVE_LEAD).length, total: leads.length },
    byStatus: LEAD_STATUSES.map((status) => ({ status, count: leads.filter((l) => l.status === status).length })),
    recent: [...leads]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, LIST)
      .map((l) => ({
        id: l.id,
        name: `${l.firstName} ${l.lastName}`,
        companyName: l.companyName,
        status: l.status,
        ownerUserId: l.ownerUserId,
        ownerName: userName(store, l.ownerUserId, l.ownerName),
        updatedAt: l.updatedAt,
      })),
  };
  if (scope !== "own") {
    const people = workloadPeople(p, store, scope, "leads.view", leads.map((l) => l.ownerUserId));
    section.workload = people.map((u) => {
      const mine = leads.filter((l) => l.ownerUserId === u.id);
      return {
        userId: u.id,
        name: u.name,
        active: u.active,
        activeLeads: mine.filter(ACTIVE_LEAD).length,
        totalLeads: mine.length,
        byStatus: Object.fromEntries(LEAD_STATUSES.map((s) => [s, mine.filter((l) => l.status === s).length])) as Record<LeadStatus, number>,
      };
    });
  }
  return section;
}

function accountsSection(p: Principal, store: Store): DashboardAccounts | undefined {
  // Account ownership is a sales measure: its scope follows metrics.sales.
  if (!dashboardSectionAllowed(p.permissions, "accounts")) return undefined;
  const scope = scopeOf(p.permissions, "metrics.sales")!;
  const accounts = store.accounts.filter(
    (a) => canOn(p, "accounts.view", a.ownerUserId) && ownerInScope(p, scope, a.ownerUserId),
  );
  const ids = new Set(accounts.map((a) => a.id));
  const canClients = can(p.permissions, "contacts.view");
  const linked = canClients
    ? new Set(store.accountContactLinks.filter((l) => ids.has(l.accountId) && !l.endedAt).map((l) => l.contactId))
    : new Set<number>();
  const section: DashboardAccounts = {
    scope,
    owned: accounts.length,
    linkedClients: [...linked].filter((cid) => {
      const c = store.contacts.find((x) => x.id === cid);
      return !!c && canOn(p, "contacts.view", c.ownerUserId);
    }).length,
    recent: [...accounts]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, LIST)
      .map((a) => ({ id: a.id, name: a.name, ownerName: userName(store, a.ownerUserId, a.ownerName), createdAt: a.createdAt })),
  };
  if (scope === "all" && canClients) {
    section.totalClients = store.contacts.filter((c) => canOn(p, "contacts.view", c.ownerUserId)).length;
  }
  if (scope !== "own") {
    const counts = new Map<number | null, number>();
    for (const a of accounts) counts.set(a.ownerUserId, (counts.get(a.ownerUserId) ?? 0) + 1);
    section.byOwner = [...counts]
      .map(([userId, count]) => ({ userId, name: userId == null ? "No owner" : userName(store, userId, "Unknown"), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return section;
}

function peopleSection(p: Principal, store: Store): DashboardPeople | undefined {
  if (!dashboardSectionAllowed(p.permissions, "people")) return undefined;
  const scope = scopeOf(p.permissions, "metrics.people")!;
  // Employees only: names, roles, departments, teams. No customer data.
  const users = store.users.filter((u) => canOn(p, "metrics.people", u.id) && canOn(p, "people.view", u.id));
  const active = users.filter((u) => u.active);
  const depCounts = new Map<DepartmentKey | null, number>();
  for (const u of active) depCounts.set(u.departmentKey, (depCounts.get(u.departmentKey) ?? 0) + 1);
  const roleCounts = new Map<RoleKey, number>();
  for (const u of active) for (const r of u.roles) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
  const teams = store.teams.filter((t) => scope === "all" || t.supervisorUserIds.includes(p.user.id));
  const person = (id: number) => store.users.find((u) => u.id === id);
  return {
    scope,
    activeEmployees: active.length,
    inactiveEmployees: users.length - active.length,
    byDepartment: [...depCounts]
      .map(([key, count]) => ({ key, label: key ? DEPARTMENT_LABELS[key] : "No department", count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byRole: [...roleCounts]
      .map(([key, count]) => ({ key, label: ROLE_LABELS[key], count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      departmentLabel: DEPARTMENT_LABELS[t.departmentKey],
      supervisors: t.supervisorUserIds.map(person).filter((u): u is User => !!u).map((u) => ({ id: u.id, name: u.name })),
      members: t.memberUserIds
        .map(person)
        .filter((u): u is User => !!u)
        .map((u) => ({ id: u.id, name: u.name, roles: u.roles.map((r) => ROLE_LABELS[r]), active: u.active })),
    })),
  };
}

function communicationSection(p: Principal, store: Store): DashboardCommunication | undefined {
  if (!dashboardSectionAllowed(p.permissions, "communication")) return undefined;
  const me = p.user.id;
  const mentions = store.mentions
    .map((m) => ({ m, c: store.cases.find((x) => x.id === m.caseId) ?? null }))
    // Same rule as GET /api/mentions: yours only, never from a case you cannot view.
    .filter(({ m, c }) => m.toUserId === me && (c === null || canOn(p, "cases.view", c.ownerUserId)))
    .sort((a, b) => Date.parse(b.m.createdAt) - Date.parse(a.m.createdAt));
  const conversations = store.conversations
    .filter((c) => c.memberUserIds.includes(me))
    .map((c) => {
      const last = store.messages
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        members: c.memberUserIds.map((id, i) => userName(store, id, c.members[i] ?? `#${id}`)),
        lastMessage: last ? trim(last.deletedAt ? "" : last.content) || null : null,
        lastMessageAt: last?.createdAt ?? null,
        sortAt: last?.createdAt ?? c.createdAt,
      };
    })
    .sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt))
    .slice(0, LIST)
    .map(({ sortAt: _s, ...rest }) => rest);
  return {
    unreadMentions: mentions.filter(({ m }) => !m.readAt).length,
    mentions: mentions.slice(0, LIST).map(({ m, c }) => ({
      id: m.id,
      fromName: userName(store, m.fromUserId, m.fromName),
      body: trim(m.body),
      caseId: m.caseId,
      caseNumber: c?.caseNumber ?? null,
      readAt: m.readAt,
      createdAt: m.createdAt,
    })),
    conversations,
  };
}

/** The whole dashboard for this caller. Sections they may not have are absent. */
export function buildDashboard(p: Principal, store: Store, now: Date = new Date()): DashboardResponse {
  const out: DashboardResponse = { generatedAt: now.toISOString() };
  const cases = casesSection(p, store, now);
  if (cases) out.cases = cases;
  const calls = callsSection(p, store, now);
  if (calls) out.calls = calls;
  const leads = leadsSection(p, store);
  if (leads) out.leads = leads;
  const accounts = accountsSection(p, store);
  if (accounts) out.accounts = accounts;
  const people = peopleSection(p, store);
  if (people) out.people = people;
  const communication = communicationSection(p, store);
  if (communication) out.communication = communication;
  return out;
}
