import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { store, type Case, type Lead } from "../src/store";
import { buildDashboard } from "../src/dashboard";
import { resolvePermissions, type RoleKey } from "../src/access";
import type { Principal } from "../src/auth/authorize";
import { createTestApp, loginAs } from "./helpers/app";
import { apiAs } from "./helpers/api";
import { sessionForNewEmployee } from "./helpers/roles";

/**
 * RBAC Phase 6 — GET /api/dashboard.
 *
 * Sections are present only with their permissions, and every number is
 * computed over the records inside the caller's scope. Expectations are
 * recomputed here from the test store (never from the endpoint itself).
 */
const app = createTestApp();
const who = {
  iris: apiAs(app, loginAs("iris@example.com")), // System Owner
  devon: apiAs(app, loginAs("devon@example.com")), // CSR
  nadia: apiAs(app, loginAs("nadia@example.com")), // CSR Supervisor (Devon, Sara)
  leo: apiAs(app, loginAs("leo@example.com")), // Business Advisor
  grace: apiAs(app, loginAs("grace@example.com")), // BA Supervisor (Leo)
  omar: apiAs(app, loginAs("omar@example.com")), // Operations Admin
  rachel: apiAs(app, loginAs("rachel@example.com")), // Operations Admin Supervisor (Omar)
  tessa: apiAs(app, loginAs("tessa@example.com")), // HR
};
type Who = keyof typeof who;

const uid = (name: string) => store.users.find((u) => u.name === name)!.id;
const open = (c: Case) => c.status !== "completed";
const activeLead = (l: Lead) => l.status !== "converted" && l.status !== "unqualified";
const casesOf = (ids: number[]) => store.cases.filter((c) => c.ownerUserId != null && ids.includes(c.ownerUserId));
const leadsOf = (ids: number[]) => store.leads.filter((l) => l.ownerUserId != null && ids.includes(l.ownerUserId));
const overdue = (t: { status: string; dueDate: string | null }) =>
  t.status !== "completed" && !!t.dueDate && Date.parse(t.dueDate) < Date.now();

async function dash(name: Who) {
  const res = await who[name].get("/dashboard");
  expect(res.status).toBe(200);
  return res.body;
}

let restore: (() => void)[] = [];
afterEach(() => {
  for (const f of restore.reverse()) f();
  restore = [];
});
function keepArray<T>(arr: T[]) {
  const saved = [...arr];
  restore.push(() => arr.splice(0, arr.length, ...saved));
}

describe("authorization", () => {
  it("requires a session", async () => {
    await request(app).get("/api/dashboard").expect(401);
  });

  it("is refused to reserved roles (no dashboard.view)", async () => {
    const filing = apiAs(app, sessionForNewEmployee("Dash Filing", ["filing"]));
    const res = await filing.get("/dashboard");
    expect(res.status).toBe(403);
    expect(res.body.cases).toBeUndefined();
  });

  it("composes sections from permissions for each active role", async () => {
    const sections = async (n: Who) =>
      Object.keys(await dash(n)).filter((k) => k !== "generatedAt").sort();
    expect(await sections("devon")).toEqual(["calls", "cases", "communication"]);
    expect(await sections("nadia")).toEqual(["calls", "cases", "communication"]);
    expect(await sections("leo")).toEqual(["accounts", "communication", "leads"]);
    expect(await sections("grace")).toEqual(["accounts", "communication", "leads"]);
    expect(await sections("omar")).toEqual(["calls", "cases", "communication"]);
    expect(await sections("rachel")).toEqual(["calls", "cases", "communication"]);
    expect(await sections("tessa")).toEqual(["communication", "people"]);
    expect(await sections("iris")).toEqual(["accounts", "calls", "cases", "communication", "leads", "people"]);
  });

  it("takes the union for an employee with several roles", async () => {
    const both = apiAs(app, sessionForNewEmployee("Dash Both", ["csr", "business_advisor"]));
    const body = (await both.get("/dashboard")).body;
    expect(Object.keys(body).sort()).toEqual(["accounts", "calls", "cases", "communication", "generatedAt", "leads"]);
  });

  it("reports the scope each section was computed at", async () => {
    expect((await dash("devon")).cases.scope).toBe("own");
    expect((await dash("nadia")).cases.scope).toBe("team");
    expect((await dash("rachel")).cases.scope).toBe("all");
    expect((await dash("leo")).leads.scope).toBe("own");
    expect((await dash("grace")).leads.scope).toBe("team");
    expect((await dash("tessa")).people.scope).toBe("all");
    const iris = await dash("iris");
    for (const k of ["cases", "calls", "leads", "accounts", "people"]) expect(iris[k].scope).toBe("all");
  });
});

describe("no leakage", () => {
  const leadStrings = () => store.leads.flatMap((l) => [`${l.firstName} ${l.lastName}`, l.email].filter(Boolean) as string[]);
  const caseStrings = () => store.cases.flatMap((c) => [c.caseNumber, c.title]);
  const customerStrings = () => [
    ...store.accounts.map((a) => a.name),
    ...(store.contacts.map((c) => c.email).filter(Boolean) as string[]),
  ];

  it("CSR, Operations Admin and HR never receive leads", async () => {
    for (const n of ["devon", "nadia", "omar", "rachel", "tessa"] as Who[]) {
      const json = JSON.stringify(await dash(n));
      for (const s of leadStrings()) expect(json).not.toContain(s);
    }
  });

  it("Business Advisors and HR never receive cases", async () => {
    for (const n of ["leo", "grace", "tessa"] as Who[]) {
      const body = await dash(n);
      expect(body.cases).toBeUndefined();
      expect(body.calls).toBeUndefined();
      const json = JSON.stringify({ ...body, communication: undefined });
      for (const s of caseStrings()) expect(json).not.toContain(s);
    }
  });

  it("HR's people figures contain employees only — no customer, case or lead data", async () => {
    const { people } = await dash("tessa");
    const json = JSON.stringify(people);
    for (const s of [...customerStrings(), ...caseStrings(), ...leadStrings()]) expect(json).not.toContain(s);
    expect(people.activeEmployees).toBe(store.users.filter((u) => u.active).length);
    expect(people.inactiveEmployees).toBe(store.users.filter((u) => !u.active).length);
    const byDept = people.byDepartment.reduce((n: number, d: { count: number }) => n + d.count, 0);
    expect(byDept).toBe(people.activeEmployees);
    expect(people.teams.map((t: { id: number }) => t.id).sort()).toEqual(store.teams.map((t) => t.id).sort());
    for (const t of people.teams) {
      const stored = store.teams.find((x) => x.id === t.id)!;
      expect(t.supervisors.map((x: { id: number }) => x.id)).toEqual(stored.supervisorUserIds);
      expect(t.members.map((x: { id: number }) => x.id)).toEqual(stored.memberUserIds);
    }
    const cs = people.teams[0];
    for (const m of cs.members) expect(Object.keys(m).sort()).toEqual(["active", "id", "name", "roles"]);
  });
});

describe("case scope", () => {
  it("CSR: own cases only, no workload table", async () => {
    const devon = uid("Devon Park");
    const { cases } = await dash("devon");
    const mine = casesOf([devon]);
    expect(cases.summary.open).toBe(mine.filter(open).length);
    expect(cases.summary.completed).toBe(mine.filter((c) => !open(c)).length);
    expect(cases.summary.urgentOpen).toBe(mine.filter((c) => open(c) && (c.priority === "high" || c.priority === "critical")).length);
    for (const list of [cases.recent, cases.attention, cases.leastRecentlyWorked]) {
      for (const item of list) expect(item.ownerUserId).toBe(devon);
    }
    expect(cases.workload).toBeUndefined();
  });

  it("Operations Admin: own cases only", async () => {
    const omar = uid("Omar Haddad");
    const { cases } = await dash("omar");
    expect(cases.summary.open + cases.summary.completed).toBe(casesOf([omar]).length);
    for (const item of cases.recent) expect(item.ownerUserId).toBe(omar);
  });

  it("CSR Supervisor: herself and the members of the team she supervises, one workload row each", async () => {
    const team = [uid("Nadia Flores"), uid("Devon Park"), uid("Sara Mitchell")];
    const { cases } = await dash("nadia");
    const inTeam = casesOf(team);
    expect(cases.summary.open + cases.summary.completed).toBe(inTeam.length);
    expect(cases.workload.map((r: { userId: number }) => r.userId).sort()).toEqual([...team].sort());
    for (const row of cases.workload) {
      const mine = casesOf([row.userId]);
      const tasks = store.tasks.filter((t) => mine.some((c) => c.id === t.caseId));
      expect(row.openCases).toBe(mine.filter(open).length);
      expect(row.openTasks).toBe(tasks.filter((t) => t.status !== "completed").length);
      expect(row.overdueTasks).toBe(tasks.filter(overdue).length);
    }
    for (const item of [...cases.recent, ...cases.attention]) expect(team).toContain(item.ownerUserId);
  });

  it("Admin Supervisor (cases metrics: all): every case, with a row per case owner", async () => {
    const { cases } = await dash("rachel");
    expect(cases.summary.open + cases.summary.completed).toBe(store.cases.length);
    const owners = new Set(store.cases.map((c) => c.ownerUserId));
    const rows = new Set(cases.workload.map((r: { userId: number | null }) => r.userId));
    for (const o of owners) expect(rows.has(o)).toBe(true);
    const sum = cases.workload.reduce((n: number, r: { openCases: number }) => n + r.openCases, 0);
    expect(sum).toBe(cases.summary.open);
  });

  it("System Owner sees the company: cases, leads, accounts and clients", async () => {
    const body = await dash("iris");
    expect(body.cases.summary.open + body.cases.summary.completed).toBe(store.cases.length);
    expect(body.leads.summary.total).toBe(store.leads.length);
    expect(body.leads.summary.active).toBe(store.leads.filter(activeLead).length);
    expect(body.accounts.owned).toBe(store.accounts.length);
    expect(body.accounts.totalClients).toBe(store.contacts.length);
    expect(body.people.activeEmployees).toBe(store.users.filter((u) => u.active).length);
  });
});

describe("breakdowns", () => {
  it("by status covers all five statuses and sums to the cases in scope", async () => {
    const { cases } = await dash("iris");
    expect(cases.byStatus.map((s: { status: string }) => s.status)).toEqual(["intake", "review", "in_progress", "waiting", "completed"]);
    for (const s of cases.byStatus) expect(s.count).toBe(store.cases.filter((c) => c.status === s.status).length);
  });

  it("by priority counts open cases only", async () => {
    const { cases } = await dash("iris");
    expect(cases.byPriority.map((p: { priority: string }) => p.priority)).toEqual(["critical", "high", "medium", "low"]);
    for (const p of cases.byPriority) {
      expect(p.count).toBe(store.cases.filter((c) => open(c) && c.priority === p.priority).length);
    }
  });

  it("the attention list holds only open cases that are high/critical or have overdue tasks, with the reasons", async () => {
    const { cases } = await dash("iris");
    for (const item of cases.attention) {
      expect(item.status).not.toBe("completed");
      expect(item.priority === "high" || item.priority === "critical" || item.overdueTasks > 0).toBe(true);
      expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  it("least recently worked is ordered oldest activity first and excludes completed cases", async () => {
    const { cases } = await dash("iris");
    const times = cases.leastRecentlyWorked.map((i: { lastActivityAt: string }) => Date.parse(i.lastActivityAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const i of cases.leastRecentlyWorked) expect(i.status).not.toBe("completed");
  });

  it("leads by status (current status of each lead) sums to the leads in scope; BA Supervisor has a row per advisor", async () => {
    const team = [uid("Grace Kim"), uid("Leo Martinez")].filter(Boolean);
    const { leads } = await dash("grace");
    const inTeam = leadsOf(team);
    expect(leads.summary.total).toBe(inTeam.length);
    expect(leads.byStatus.reduce((n: number, s: { count: number }) => n + s.count, 0)).toBe(inTeam.length);
    expect(leads.workload.map((r: { userId: number }) => r.userId).sort()).toEqual([...team].sort());
    const leo = (await dash("leo")).leads;
    expect(leo.workload).toBeUndefined();
    for (const l of leo.recent) expect(l.ownerUserId).toBe(uid("Leo Martinez"));
  });

  it("Business Advisor: accounts they own, and the clients linked to them", async () => {
    const leo = uid("Leo Martinez");
    const { accounts } = await dash("leo");
    const mine = store.accounts.filter((a) => a.ownerUserId === leo);
    expect(accounts.owned).toBe(mine.length);
    const linked = new Set(
      store.accountContactLinks.filter((l) => !l.endedAt && mine.some((a) => a.id === l.accountId)).map((l) => l.contactId),
    );
    expect(accounts.linkedClients).toBe(linked.size);
    expect(accounts.totalClients).toBeUndefined();
  });
});

describe("task counts, calls and lastActivityAt follow real changes", () => {
  it("an overdue task on Devon's case moves Devon's and Nadia's counts by exactly one", async () => {
    keepArray(store.tasks);
    const c = store.cases.find((x) => x.ownerUserId === uid("Devon Park") && open(x))!;
    const before = { devon: (await dash("devon")).cases, nadia: (await dash("nadia")).cases, omar: (await dash("omar")).cases };
    const res = await who.devon.post("/tasks", { caseId: c.id, title: "Call back", dueDate: "2020-01-01T00:00:00.000Z" });
    expect(res.status).toBe(201);
    const after = { devon: (await dash("devon")).cases, nadia: (await dash("nadia")).cases, omar: (await dash("omar")).cases };
    expect(after.devon.summary.openTasks).toBe(before.devon.summary.openTasks + 1);
    expect(after.devon.summary.overdueTasks).toBe(before.devon.summary.overdueTasks + 1);
    const row = (d: typeof before.nadia) => d.workload.find((r: { userId: number }) => r.userId === uid("Devon Park"));
    expect(row(after.nadia).overdueTasks).toBe(row(before.nadia).overdueTasks + 1);
    expect(after.omar.summary).toEqual(before.omar.summary);
    // The case is now in Devon's attention list for its overdue task.
    const item = after.devon.attention.find((i: { id: number }) => i.id === c.id);
    if (item) expect(item.reasons).toContain("overdue_tasks");
  });

  it("a comment makes the case's lastActivityAt that comment, without touching Case.updatedAt", async () => {
    keepArray(store.threadEntries);
    keepArray(store.mentions);
    const c = store.cases.find((x) => x.ownerUserId === uid("Devon Park") && open(x))!;
    const updatedAt = c.updatedAt;
    const res = await who.devon.post(`/cases/${c.id}/thread`, { body: "Spoke with the client" });
    expect(res.status).toBe(201);
    const { cases } = await dash("devon");
    const item = cases.recent.find((i: { id: number }) => i.id === c.id);
    expect(item).toBeDefined();
    expect(item.lastActivityAt).toBe(res.body.createdAt);
    expect(item.lastActivitySource).toBe("comment");
    expect(cases.recent[0].id).toBe(c.id);
    expect(store.cases.find((x) => x.id === c.id)!.updatedAt).toBe(updatedAt);
    expect(cases.recentActivity[0]).toMatchObject({ kind: "comment", caseId: c.id, byName: "Devon Park" });
  });

  it("a logged call counts for its author (own), their supervisor (team), and not another admin", async () => {
    keepArray(store.caseInteractions);
    const c = store.cases.find((x) => x.ownerUserId === uid("Devon Park"))!;
    const before = { devon: (await dash("devon")).calls, nadia: (await dash("nadia")).calls, omar: (await dash("omar")).calls };
    const res = await who.devon.post(`/cases/${c.id}/contacts`, { direction: "inbound", channel: "phone", summary: "Asked about filing", contact: "Client" });
    expect(res.status).toBe(201);
    const after = { devon: (await dash("devon")).calls, nadia: (await dash("nadia")).calls, omar: (await dash("omar")).calls };
    expect(after.devon.last7Days).toBe(before.devon.last7Days + 1);
    expect(after.nadia.last7Days).toBe(before.nadia.last7Days + 1);
    expect(after.omar.last7Days).toBe(before.omar.last7Days);
    expect(after.devon.recent[0]).toMatchObject({ caseId: c.id, channel: "phone", byName: "Devon Park" });
    const phone = after.devon.byChannel30.find((x: { channel: string }) => x.channel === "phone");
    expect(phone.count).toBe(before.devon.byChannel30.find((x: { channel: string }) => x.channel === "phone").count + 1);
  });

  it("unread mentions match the employee's own mentions", async () => {
    const devon = uid("Devon Park");
    const { communication } = await dash("devon");
    const list = (await who.devon.get("/mentions")).body as { readAt: string | null }[];
    expect(communication.unreadMentions).toBe(list.filter((m) => !m.readAt).length);
    for (const m of communication.mentions) {
      expect(store.mentions.find((x) => x.id === m.id)!.toUserId).toBe(devon);
    }
    for (const c of communication.conversations) {
      expect(store.conversations.find((x) => x.id === c.id)!.memberUserIds).toContain(devon);
    }
  });
});

describe("empty data: true zeros", () => {
  const empty = () =>
    ({
      ...store,
      accounts: [], contacts: [], accountContactLinks: [], leads: [], cases: [], tasks: [], documents: [],
      conversations: [], messages: [], caseInteractions: [], threadEntries: [], mentions: [], teams: [],
      users: store.users.filter((u) => u.name === "Iris Burgos"),
    }) as unknown as typeof store;
  const principal = (roles: RoleKey[]): Principal => ({
    user: store.users.find((u) => u.name === "Iris Burgos")!,
    permissions: resolvePermissions(roles),
    supervisedUserIds: new Set(),
  });

  it("returns zero counts and empty lists — not missing sections — when nothing exists", () => {
    const d = buildDashboard(principal(["system_owner"]), empty(), new Date("2026-03-01T12:00:00Z"));
    expect(d.cases!.summary).toEqual({ open: 0, completed: 0, urgentOpen: 0, openTasks: 0, overdueTasks: 0 });
    expect(d.cases!.byStatus.every((s) => s.count === 0)).toBe(true);
    expect(d.cases!.byPriority.every((s) => s.count === 0)).toBe(true);
    expect(d.cases!.trend30).toHaveLength(30);
    expect(d.cases!.trend30.every((x) => x.cases === 0 && x.tasks === 0)).toBe(true);
    expect(d.cases!.trend30.at(-1)!.date).toBe("2026-03-01");
    expect(d.cases!.recent).toEqual([]);
    expect(d.cases!.attention).toEqual([]);
    expect(d.cases!.leastRecentlyWorked).toEqual([]);
    expect(d.calls).toMatchObject({ last7Days: 0, last30Days: 0, recent: [] });
    expect(d.leads!.summary).toEqual({ active: 0, total: 0 });
    expect(d.accounts).toMatchObject({ owned: 0, linkedClients: 0, totalClients: 0, recent: [] });
    expect(d.people!.teams).toEqual([]);
    expect(d.communication).toEqual({ unreadMentions: 0, mentions: [], conversations: [] });
  });

  it("an employee with no roles gets no sections at all", () => {
    const d = buildDashboard(principal([]), empty());
    expect(Object.keys(d)).toEqual(["generatedAt"]);
  });
});
