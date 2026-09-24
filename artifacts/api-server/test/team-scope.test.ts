import { describe, it, expect, afterEach } from "vitest";
import { store, nextTeamId, type Team } from "../src/store";
import { createTestApp, loginAs } from "./helpers/app";
import { apiAs } from "./helpers/api";
import { sessionForNewEmployee } from "./helpers/roles";

/**
 * RBAC Phase 4 — real team scope from stable ids, and reassignment.
 *
 * "team" = the caller's own records + records owned by members of the teams
 * the caller supervises, read from the stored teams at request time. Never
 * from departments, role names or display names.
 */
const app = createTestApp();
const who = {
  iris: apiAs(app, loginAs("iris@example.com")), // System Owner
  devon: apiAs(app, loginAs("devon@example.com")), // CSR — Customer Service member
  sara: apiAs(app, loginAs("sara@example.com")), // CSR — Customer Service member
  nadia: apiAs(app, loginAs("nadia@example.com")), // CSR Supervisor — supervises Customer Service
  leo: apiAs(app, loginAs("leo@example.com")), // Business Advisor — Business Advisors member
  grace: apiAs(app, loginAs("grace@example.com")), // BA Supervisor — supervises Business Advisors
  omar: apiAs(app, loginAs("omar@example.com")), // Admin — Operations member
  rachel: apiAs(app, loginAs("rachel@example.com")), // Admin Supervisor — supervises Operations
};

const uid = (name: string) => store.users.find((u) => u.name === name)!.id;
const team = (name: string) => store.teams.find((t) => t.name === name)!;
const caseOf = (name: string) => store.cases.find((c) => c.ownerUserId === uid(name))!;

// Every test that changes teams or users puts them back.
let restore: (() => void)[] = [];
afterEach(() => {
  for (const f of restore.reverse()) f();
  restore = [];
});
function snapshotTeams() {
  const saved = JSON.parse(JSON.stringify(store.teams)) as Team[];
  restore.push(() => store.teams.splice(0, store.teams.length, ...saved));
}
function setActive(name: string, active: boolean) {
  const u = store.users.find((x) => x.name === name)!;
  const was = u.active;
  u.active = active;
  restore.push(() => (u.active = was));
}

async function ownCase(api: ReturnType<typeof apiAs>, title: string) {
  const res = await api.post("/cases", { title, accountId: 1 });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("CSR Supervisor (Customer Service)", () => {
  it("edits her team members' cases and her own, not other departments'", async () => {
    expect((await who.nadia.patch(`/cases/${caseOf("Devon Park").id}`, { priority: "high" })).status).toBe(200);
    expect((await who.nadia.patch(`/cases/${caseOf("Sara Mitchell").id}`, { priority: "high" })).status).toBe(200);
    const own = await ownCase(who.nadia, "Nadia's own");
    expect((await who.nadia.patch(`/cases/${own}`, { priority: "low" })).status).toBe(200);
    const iris = await who.nadia.patch(`/cases/${caseOf("Iris Burgos").id}`, { priority: "high" });
    expect(iris.body).toEqual({ error: "out_of_scope", permission: "cases.edit" });
    const omars = await ownCase(who.omar, "Omar's case");
    expect((await who.nadia.patch(`/cases/${omars}`, { priority: "high" })).status).toBe(403);
  });

  it("reassigns cases between her team members only", async () => {
    const c = caseOf("Devon Park");
    const moved = await who.nadia.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Sara Mitchell") });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ ownerUserId: uid("Sara Mitchell"), ownerName: "Sara Mitchell" });
    // Back to Devon, then attempts across the team boundary.
    expect((await who.nadia.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Devon Park") })).status).toBe(200);
    expect((await who.nadia.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Omar Haddad") })).body)
      .toEqual({ error: "target_out_of_scope", permission: "cases.assign" });
    expect((await who.nadia.put(`/cases/${caseOf("Iris Burgos").id}/owner`, { ownerUserId: uid("Devon Park") })).body)
      .toEqual({ error: "out_of_scope", permission: "cases.assign" });
    expect(store.cases.find((x) => x.id === c.id)!.ownerUserId).toBe(uid("Devon Park"));
  });

  it("keeps her company-wide view and work", async () => {
    expect((await who.nadia.get("/cases")).body).toHaveLength(store.cases.length);
    expect((await who.nadia.post(`/cases/${caseOf("Iris Burgos").id}/thread`, { body: "note" })).status).toBe(201);
  });

  it("team membership gives members nothing over each other", async () => {
    const res = await who.devon.patch(`/cases/${caseOf("Sara Mitchell").id}`, { priority: "low" });
    expect(res.body.error).toBe("out_of_scope");
  });
});

describe("Business Advisor Supervisor (Business Advisors)", () => {
  it("sees, edits, converts, reassigns and deletes her team's leads, not others'", async () => {
    const leos = (await who.leo.post("/leads", { firstName: "Leo", lastName: "Lead" })).body;
    const iris = (await who.iris.post("/leads", { firstName: "Iris", lastName: "Lead" })).body;
    const list = (await who.grace.get("/leads")).body as any[];
    expect(list.some((l) => l.id === leos.id)).toBe(true);
    expect(list.some((l) => l.id === iris.id)).toBe(false);
    expect(list.every((l) => [uid("Leo Martinez"), uid("Grace Kim")].includes(l.ownerUserId))).toBe(true);

    expect((await who.grace.patch(`/leads/${leos.id}`, { notes: "coaching" })).status).toBe(200);
    expect((await who.grace.patch(`/leads/${iris.id}`, { notes: "x" })).status).toBe(404);
    expect((await who.grace.put(`/leads/${leos.id}/owner`, { ownerUserId: uid("Grace Kim") })).status).toBe(200);
    expect((await who.grace.put(`/leads/${leos.id}/owner`, { ownerUserId: uid("Leo Martinez") })).status).toBe(200);
    expect((await who.grace.put(`/leads/${leos.id}/owner`, { ownerUserId: uid("Iris Burgos") })).body.error).toBe("target_out_of_scope");
    const conv = await who.grace.post(`/leads/${leos.id}/convert`, { accountName: "Team Deal LLC", linkRole: "Owner" });
    expect(conv.status).toBe(201);
    const another = (await who.leo.post("/leads", { firstName: "Drop", lastName: "Me" })).body;
    expect((await who.grace.del(`/leads/${another.id}`)).status).toBe(204);
  });

  it("the Business Advisor still sees only his own", async () => {
    const graces = (await who.grace.post("/leads", { firstName: "Grace", lastName: "Own" })).body;
    const list = (await who.leo.get("/leads")).body as any[];
    expect(list.some((l) => l.id === graces.id)).toBe(false);
    expect(list.every((l) => l.ownerUserId === uid("Leo Martinez"))).toBe(true);
  });
});

describe("Admin Supervisor (Operations)", () => {
  it("edits every case (all) but reassigns only inside Operations (team)", async () => {
    expect((await who.rachel.patch(`/cases/${caseOf("Devon Park").id}`, { description: "all scope" })).status).toBe(200);
    const omars = await ownCase(who.omar, "Ops work");
    expect((await who.rachel.put(`/cases/${omars}/owner`, { ownerUserId: uid("Rachel Stein") })).status).toBe(200);
    expect((await who.rachel.put(`/cases/${omars}/owner`, { ownerUserId: uid("Omar Haddad") })).status).toBe(200);
    expect((await who.rachel.put(`/cases/${omars}/owner`, { ownerUserId: uid("Devon Park") })).body.error).toBe("target_out_of_scope");
    expect((await who.rachel.put(`/cases/${caseOf("Devon Park").id}/owner`, { ownerUserId: uid("Omar Haddad") })).body.error).toBe("out_of_scope");
  });

  it("reassigns accounts and clients inside Operations only", async () => {
    const acct = (await who.omar.post("/accounts", { name: "Omar Ops LLC" })).body;
    expect(acct.ownerUserId).toBe(uid("Omar Haddad"));
    expect((await who.rachel.put(`/accounts/${acct.id}/owner`, { ownerUserId: uid("Rachel Stein") })).status).toBe(200);
    expect((await who.rachel.put(`/accounts/${acct.id}/owner`, { ownerUserId: uid("Devon Park") })).body.error).toBe("target_out_of_scope");
    const devonsAccount = store.accounts.find((a) => a.ownerUserId === uid("Devon Park"))!;
    expect((await who.rachel.put(`/accounts/${devonsAccount.id}/owner`, { ownerUserId: uid("Rachel Stein") })).body.error).toBe("out_of_scope");

    const client = (await who.omar.post("/contacts", { firstName: "Ops", lastName: "Client" })).body;
    expect((await who.rachel.put(`/contacts/${client.id}/owner`, { ownerUserId: uid("Rachel Stein") })).status).toBe(200);
  });
});

describe("System Owner", () => {
  it("reassigns across teams", async () => {
    const c = caseOf("Sara Mitchell");
    expect((await who.iris.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Omar Haddad") })).status).toBe(200);
    expect((await who.iris.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Sara Mitchell") })).status).toBe(200);
  });
});

describe("reassignment targets", () => {
  it("must exist, be active, and be able to own that kind of record", async () => {
    const c = caseOf("Devon Park");
    expect((await who.iris.put(`/cases/${c.id}/owner`, { ownerUserId: 99999 })).body).toEqual({ error: "unknown_user" });
    setActive("Sara Mitchell", false);
    expect((await who.iris.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Sara Mitchell") })).body).toEqual({ error: "inactive_user" });
    expect((await who.iris.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Leo Martinez") })).body)
      .toEqual({ error: "target_cannot_own", permission: "cases.view" });
    expect((await who.iris.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Tessa Nguyen") })).status).toBe(400);
    expect(store.cases.find((x) => x.id === c.id)!.ownerUserId).toBe(uid("Devon Park"));
  });

  it("are chosen by id only — a display name is refused", async () => {
    const c = caseOf("Devon Park");
    const byName = await who.nadia.put(`/cases/${c.id}/owner`, { ownerName: "Sara Mitchell" });
    expect(byName.status).toBe(400);
    const both = await who.nadia.put(`/cases/${c.id}/owner`, { ownerUserId: uid("Sara Mitchell"), ownerName: "Iris Burgos" });
    expect(both.status).toBe(400);
    for (const [url, body] of [
      [`/accounts/${store.accounts[0].id}`, { ownerName: "Devon Park" }],
      [`/contacts/${store.contacts[0].id}`, { ownerName: "Devon Park" }],
    ] as const) {
      const res = await who.iris.patch(url, body);
      expect(res.body.error).toBe("owner_change_requires_reassign");
    }
    expect(store.cases.find((x) => x.id === c.id)!.ownerUserId).toBe(uid("Devon Park"));
  });

  it("need the assign permission at all", async () => {
    expect((await who.devon.put(`/cases/${caseOf("Devon Park").id}/owner`, { ownerUserId: uid("Sara Mitchell") })).body)
      .toEqual({ error: "forbidden", permission: "cases.assign" });
  });
});

describe("team membership changes take effect immediately", () => {
  it("employee added to a team, then removed", async () => {
    snapshotTeams();
    const omars = await ownCase(who.omar, "Moves teams");
    expect((await who.nadia.patch(`/cases/${omars}`, { priority: "high" })).status).toBe(403);
    team("Customer Service").memberUserIds.push(uid("Omar Haddad"));
    expect((await who.nadia.patch(`/cases/${omars}`, { priority: "high" })).status).toBe(200);
    team("Customer Service").memberUserIds = team("Customer Service").memberUserIds.filter((id) => id !== uid("Omar Haddad"));
    expect((await who.nadia.patch(`/cases/${omars}`, { priority: "low" })).status).toBe(403);
  });

  it("supervisor changed", async () => {
    snapshotTeams();
    const newSup = apiAs(app, sessionForNewEmployee("Paula Lane", ["csr_supervisor"]));
    const devons = caseOf("Devon Park").id;
    expect((await newSup.patch(`/cases/${devons}`, { priority: "high" })).status).toBe(403);
    team("Customer Service").supervisorUserIds = [uid("Paula Lane")];
    expect((await newSup.patch(`/cases/${devons}`, { priority: "high" })).status).toBe(200);
    expect((await who.nadia.patch(`/cases/${devons}`, { priority: "low" })).status).toBe(403);
  });

  it("deactivated member: supervisor still manages their records, but cannot assign to them", async () => {
    const saras = caseOf("Sara Mitchell").id;
    setActive("Sara Mitchell", false);
    expect((await who.nadia.patch(`/cases/${saras}`, { priority: "high" })).status).toBe(200);
    expect((await who.nadia.put(`/cases/${saras}/owner`, { ownerUserId: uid("Devon Park") })).status).toBe(200);
    expect((await who.nadia.put(`/cases/${saras}/owner`, { ownerUserId: uid("Sara Mitchell") })).body.error).toBe("inactive_user");
    // put it back for later tests
    setActive("Sara Mitchell", true);
    expect((await who.nadia.put(`/cases/${saras}/owner`, { ownerUserId: uid("Sara Mitchell") })).status).toBe(200);
  });

  it("an unrelated department's employee stays out of scope", async () => {
    const leos = (await who.leo.post("/leads", { firstName: "Unrelated", lastName: "Lead" })).body;
    // Nadia holds no leads permission at all; Rachel's team is Operations.
    expect((await who.nadia.get("/leads")).status).toBe(403);
    const acct = (await who.iris.post("/accounts", { name: "Leo Owned LLC" })).body;
    await who.iris.put(`/accounts/${acct.id}/owner`, { ownerUserId: uid("Leo Martinez") });
    expect((await who.rachel.put(`/accounts/${acct.id}/owner`, { ownerUserId: uid("Rachel Stein") })).body.error).toBe("out_of_scope");
    expect(leos.ownerUserId).toBe(uid("Leo Martinez"));
  });

  it("a supervisor of two teams covers both", async () => {
    snapshotTeams();
    const omars = await ownCase(who.omar, "Second team");
    store.teams.push({
      id: nextTeamId(), name: "Escalations", departmentKey: "customer_service",
      memberUserIds: [uid("Omar Haddad")], supervisorUserIds: [uid("Nadia Flores")], demo: true, createdAt: new Date().toISOString(),
    });
    expect((await who.nadia.patch(`/cases/${omars}`, { priority: "high" })).status).toBe(200);
    expect((await who.nadia.patch(`/cases/${caseOf("Devon Park").id}`, { priority: "high" })).status).toBe(200);
    // Omar is now in two teams; Rachel still covers him through Operations.
    expect((await who.rachel.put(`/cases/${omars}/owner`, { ownerUserId: uid("Rachel Stein") })).status).toBe(200);
  });

  it("department alone grants nothing: a CSR Supervisor with no team supervises no one", async () => {
    const loner = apiAs(app, sessionForNewEmployee("Lone Supervisor", ["csr_supervisor"]));
    const u = store.users.find((x) => x.name === "Lone Supervisor")!;
    u.departmentKey = "customer_service";
    expect((await loner.patch(`/cases/${caseOf("Devon Park").id}`, { priority: "high" })).status).toBe(403);
  });
});
