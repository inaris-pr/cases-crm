import { describe, it, expect } from "vitest";
import request from "supertest";
import { store } from "../src/store";
import { createTestApp, loginAs } from "./helpers/app";
import { apiAs } from "./helpers/api";

/**
 * Phase 7 — case categories, lifecycle history, closing/reopening,
 * resolution time and escalations. Runs on this file's isolated seed.
 */
const app = createTestApp();
const who = {
  iris: apiAs(app, loginAs("iris@example.com")), // System Owner
  devon: apiAs(app, loginAs("devon@example.com")), // CSR: cases.work all, cases.edit own
  sara: apiAs(app, loginAs("sara@example.com")), // CSR
  nadia: apiAs(app, loginAs("nadia@example.com")), // CSR Supervisor: cases.edit team (Devon, Sara)
  omar: apiAs(app, loginAs("omar@example.com")), // Operations Admin
  rachel: apiAs(app, loginAs("rachel@example.com")), // Operations Admin Supervisor: cases.edit all
  leo: apiAs(app, loginAs("leo@example.com")), // Business Advisor: no case access
  tessa: apiAs(app, loginAs("tessa@example.com")), // HR: no case access
};
const uid = (name: string) => store.users.find((u) => u.name === name)!.id;
const events = (caseId: number) => store.caseStatusEvents.filter((e) => e.caseId === caseId);

async function newCase(api: (typeof who)[keyof typeof who], extra: Record<string, unknown> = {}) {
  const res = await api.post("/cases", { title: `Phase 7 ${Math.random()}`, accountId: 1, ...extra });
  expect(res.status).toBe(201);
  return res.body as { id: number; category: string | null; closedAt: string | null; createdAt: string; status: string };
}

describe("category", () => {
  it("every approved category is accepted on create and edit, and survives a read", async () => {
    for (const category of ["general", "formation_filing", "compliance", "registered_agent", "ein_tax", "billing_refund",
      "customer_dispute", "filing_correction", "partner_issue", "account_portal"]) {
      const c = await newCase(who.devon, { category });
      expect(c.category).toBe(category);
      expect((await who.devon.get(`/cases/${c.id}`)).body.category).toBe(category);
    }
  });

  it("is optional: omitted or null means uncategorized; it can be cleared", async () => {
    const c = await newCase(who.devon);
    expect(c.category).toBeNull();
    expect((await who.devon.patch(`/cases/${c.id}`, { category: "ein_tax" })).body.category).toBe("ein_tax");
    expect((await who.devon.patch(`/cases/${c.id}`, { category: null })).body.category).toBeNull();
    expect((await newCase(who.devon, { category: null })).category).toBeNull();
  });

  it("rejects unknown categories on create and edit", async () => {
    expect((await who.devon.post("/cases", { title: "x", accountId: 1, category: "chargeback" })).status).toBe(400);
    const c = await newCase(who.devon);
    expect((await who.devon.patch(`/cases/${c.id}`, { category: "Formation / Filing" })).status).toBe(400);
    expect(store.cases.find((x) => x.id === c.id)!.category).toBeNull();
  });

  it("existing (seeded) Cases stay valid and uncategorized — never guessed from title or tags", async () => {
    const seeded = store.cases.filter((c) => c.id <= 15);
    expect(seeded.every((c) => c.category === null)).toBe(true);
    const list = await who.iris.get("/cases");
    expect(list.status).toBe(200);
    expect(list.body.filter((c: { id: number }) => c.id <= 15).every((c: { category: unknown }) => c.category === null)).toBe(true);
  });

  it("editing the category needs cases.edit on that Case", async () => {
    const saras = await newCase(who.sara);
    const res = await who.devon.patch(`/cases/${saras.id}`, { category: "compliance" });
    expect(res.body).toEqual({ error: "out_of_scope", permission: "cases.edit" });
    expect((await who.nadia.patch(`/cases/${saras.id}`, { category: "compliance" })).status).toBe(200);
  });
});

describe("lifecycle history and closing", () => {
  it("an ordinary status change is recorded with the session's employee", async () => {
    const c = await newCase(who.devon);
    const res = await who.devon.patch(`/cases/${c.id}`, { status: "in_progress" });
    expect(res.status).toBe(200);
    expect(res.body.closedAt).toBeNull();
    expect(events(c.id)).toEqual([
      expect.objectContaining({ kind: "status_change", fromStatus: "intake", toStatus: "in_progress", changedByUserId: uid("Devon Park"), changedByName: "Devon Park" }),
    ]);
  });

  it("non-terminal → completed sets closedAt and who closed it; spoofed identity in the body is ignored", async () => {
    const c = await newCase(who.devon, { status: "waiting" });
    const res = await who.devon.patch(`/cases/${c.id}`, {
      status: "completed",
      changedByUserId: 1, changedByName: "Iris Burgos", closedByUserId: 1, closedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(200);
    const ev = events(c.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "closed", fromStatus: "waiting", toStatus: "completed", changedByUserId: uid("Devon Park") });
    expect(res.body).toMatchObject({ closedAt: ev[0].changedAt, closedByUserId: uid("Devon Park"), closedByName: "Devon Park" });
    expect(res.body.closedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("a no-op status update, or an update without status, records nothing", async () => {
    const c = await newCase(who.devon);
    await who.devon.patch(`/cases/${c.id}`, { status: "intake" });
    await who.devon.patch(`/cases/${c.id}`, { title: "Renamed", priority: "high" });
    expect(events(c.id)).toEqual([]);
  });

  it("a legacy completed Case (closed before Phase 7) has no closedAt and no resolution — nothing is inferred", async () => {
    const legacy = store.cases.find((c) => c.status === "completed" && c.id <= 15)!;
    const res = await who.iris.get(`/cases/${legacy.id}`);
    expect(res.body).toMatchObject({ status: "completed", closedAt: null, closedByUserId: null, resolution: null, statusHistory: [] });
    // Saving it again as completed is a no-op: still no invented closing time.
    await who.iris.patch(`/cases/${legacy.id}`, { status: "completed" });
    expect(store.cases.find((c) => c.id === legacy.id)!.closedAt).toBeNull();
    expect(events(legacy.id)).toEqual([]);
  });

  it("created directly as completed: closed by its creator at creation", async () => {
    const c = await newCase(who.devon, { status: "completed" });
    expect(c.closedAt).toBe(c.createdAt);
    expect(events(c.id)).toEqual([
      expect.objectContaining({ kind: "closed", fromStatus: null, toStatus: "completed", changedAt: c.createdAt, changedByUserId: uid("Devon Park") }),
    ]);
  });

  it("an employee who may not edit the Case cannot close it, and nothing is recorded", async () => {
    const saras = await newCase(who.sara);
    expect((await who.devon.patch(`/cases/${saras.id}`, { status: "completed" })).status).toBe(403);
    expect(store.cases.find((c) => c.id === saras.id)!.status).toBe("intake");
    expect(events(saras.id)).toEqual([]);
  });
});

describe("reopen and close again", () => {
  it("reopening clears the current closedAt but keeps the closure in history; closing again adds a new one", async () => {
    const c = await newCase(who.devon);
    const closed1 = (await who.devon.patch(`/cases/${c.id}`, { status: "completed" })).body;
    expect(closed1.closedAt).not.toBeNull();

    const reopened = (await who.nadia.patch(`/cases/${c.id}`, { status: "review" })).body;
    expect(reopened).toMatchObject({ status: "review", closedAt: null, closedByUserId: null });

    await new Promise((r) => setTimeout(r, 5));
    const closed2 = (await who.devon.patch(`/cases/${c.id}`, { status: "completed" })).body;
    expect(Date.parse(closed2.closedAt)).toBeGreaterThan(Date.parse(closed1.closedAt));

    const detail = (await who.devon.get(`/cases/${c.id}`)).body;
    expect(detail.statusHistory.map((e: { kind: string }) => e.kind)).toEqual(["closed", "reopened", "closed"]);
    expect(detail.statusHistory[0].changedAt).toBe(closed1.closedAt);
    expect(detail.statusHistory[1]).toMatchObject({ fromStatus: "completed", toStatus: "review", changedByName: "Nadia Flores" });
    expect(detail.resolution).toMatchObject({ closedAt: closed2.closedAt, closures: 2 });
    expect(detail.resolution.latestCycleMs).toBe(Date.parse(closed2.closedAt) - Date.parse(detail.statusHistory[1].changedAt));
  });

  it("a legacy completed Case can be reopened and then gets a real closedAt when closed again", async () => {
    const legacy = store.cases.find((c) => c.status === "completed" && c.id <= 15 && c.closedAt === null)!;
    const before = legacy.status;
    expect(before).toBe("completed");
    const reopened = (await who.iris.patch(`/cases/${legacy.id}`, { status: "in_progress" })).body;
    expect(reopened.closedAt).toBeNull();
    const closed = (await who.iris.patch(`/cases/${legacy.id}`, { status: "completed" })).body;
    expect(closed.closedAt).toBe(events(legacy.id).at(-1)!.changedAt);
    expect(events(legacy.id).map((e) => e.kind)).toEqual(["reopened", "closed"]);
  });
});

describe("resolution time", () => {
  it("closedAt − createdAt, only for a closed Case with a known closedAt", async () => {
    const c = await newCase(who.devon);
    const row = store.cases.find((x) => x.id === c.id)!;
    row.createdAt = new Date(Date.now() - 3 * 86_400_000).toISOString(); // test-only: an older Case
    expect((await who.devon.get(`/cases/${c.id}`)).body.resolution).toBeNull(); // still open
    await who.devon.patch(`/cases/${c.id}`, { status: "completed" });
    const detail = (await who.devon.get(`/cases/${c.id}`)).body;
    expect(detail.resolution).toEqual({
      totalMs: Date.parse(detail.closedAt) - Date.parse(row.createdAt),
      latestCycleMs: null,
      closedAt: detail.closedAt,
      closures: 1,
    });
    // Deterministic: the same answer on every read.
    expect((await who.devon.get(`/cases/${c.id}`)).body.resolution).toEqual(detail.resolution);
  });
});

describe("escalations", () => {
  it("anyone with cases.work on the Case escalates; the author is the session, not the body", async () => {
    const saras = await newCase(who.sara, { priority: "low" });
    const res = await who.devon.post(`/cases/${saras.id}/escalations`, {
      reason: "customer_dispute", note: "  Customer disputes the filing fee  ", escalatedByUserId: 1, escalatedByName: "Iris Burgos",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      caseId: saras.id, reason: "customer_dispute", note: "Customer disputes the filing fee",
      escalatedByUserId: uid("Devon Park"), escalatedByName: "Devon Park", resolvedAt: null,
    });
    // Priority is its own concept: unchanged.
    expect(store.cases.find((c) => c.id === saras.id)!.priority).toBe("low");
    // Shown with the Case to Case viewers.
    const row = (await who.sara.get("/cases")).body.find((c: { id: number }) => c.id === saras.id);
    expect(row.activeEscalation).toMatchObject({ id: res.body.id, reason: "customer_dispute" });
  });

  it("one active escalation per Case; reasons are validated; the note is optional", async () => {
    const c = await newCase(who.devon);
    expect((await who.devon.post(`/cases/${c.id}/escalations`, { reason: "chargeback" })).status).toBe(400);
    expect((await who.devon.post(`/cases/${c.id}/escalations`, {})).status).toBe(400);
    const first = await who.devon.post(`/cases/${c.id}/escalations`, { reason: "deadline_risk" });
    expect(first.status).toBe(201);
    expect(first.body.note).toBeNull();
    const second = await who.devon.post(`/cases/${c.id}/escalations`, { reason: "other", note: "again" });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("already_escalated");
    expect(store.caseEscalations.filter((e) => e.caseId === c.id)).toHaveLength(1);
  });

  it("resolving needs cases.edit on the Case; history is kept; a new escalation is allowed afterwards", async () => {
    const saras = await newCase(who.sara);
    const esc = (await who.devon.post(`/cases/${saras.id}/escalations`, { reason: "refund_request" })).body;
    // Devon (CSR) may edit only his own Cases.
    const refused = await who.devon.post(`/cases/${saras.id}/escalations/${esc.id}/resolve`, {});
    expect(refused.body).toEqual({ error: "out_of_scope", permission: "cases.edit" });
    // Omar (Operations Admin) edits only his own Cases too.
    expect((await who.omar.post(`/cases/${saras.id}/escalations/${esc.id}/resolve`, {})).status).toBe(403);
    // Nadia supervises Sara.
    const resolved = await who.nadia.post(`/cases/${saras.id}/escalations/${esc.id}/resolve`, { resolvedByUserId: 1 });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ resolvedByUserId: uid("Nadia Flores"), resolvedByName: "Nadia Flores" });
    expect(resolved.body.resolvedAt).not.toBeNull();
    expect((await who.nadia.post(`/cases/${saras.id}/escalations/${esc.id}/resolve`, {})).status).toBe(409);

    const again = await who.sara.post(`/cases/${saras.id}/escalations`, { reason: "customer_impact" });
    expect(again.status).toBe(201);
    const detail = (await who.sara.get(`/cases/${saras.id}`)).body;
    expect(detail.escalations.map((e: { reason: string; resolvedAt: string | null }) => [e.reason, e.resolvedAt === null])).toEqual([
      ["refund_request", false],
      ["customer_impact", true],
    ]);
    expect(detail.activeEscalation.id).toBe(again.body.id);
    // The owner can resolve her own Case's escalation.
    expect((await who.sara.post(`/cases/${saras.id}/escalations/${again.body.id}/resolve`, {})).status).toBe(200);
  });

  it("an escalation id from another Case is not found", async () => {
    const a = await newCase(who.devon);
    const b = await newCase(who.devon);
    const esc = (await who.devon.post(`/cases/${a.id}/escalations`, { reason: "other" })).body;
    expect((await who.devon.post(`/cases/${b.id}/escalations/${esc.id}/resolve`, {})).body).toEqual({ error: "escalation_not_found" });
  });

  it("escalating does not touch Case.updatedAt (the default Last Modified order)", async () => {
    const c = await newCase(who.devon);
    const before = store.cases.find((x) => x.id === c.id)!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await who.devon.post(`/cases/${c.id}/escalations`, { reason: "other" });
    expect(store.cases.find((x) => x.id === c.id)!.updatedAt).toBe(before);
  });

  it("Business Advisors and HR get no Case or escalation data anywhere", async () => {
    const c = await newCase(who.devon, { category: "customer_dispute" });
    await who.devon.post(`/cases/${c.id}/escalations`, { reason: "customer_dispute" });
    for (const api of [who.leo, who.tessa]) {
      expect((await api.post(`/cases/${c.id}/escalations`, { reason: "other" })).status).toBe(403);
      expect((await api.post(`/cases/${c.id}/escalations/1/resolve`, {})).status).toBe(403);
      expect((await api.get(`/cases/${c.id}`)).status).toBe(403);
      expect((await api.get("/cases?escalated=true")).status).toBe(403);
      const dash = (await api.get("/dashboard")).body;
      expect(dash.cases).toBeUndefined();
      expect(JSON.stringify(dash)).not.toMatch(/escalat|customer_dispute/i);
    }
    const account = (await who.leo.get("/accounts/1")).body;
    expect(JSON.stringify(account)).not.toMatch(/escalat|category|closedAt/i);
    expect((await who.tessa.get("/accounts/1")).status).toBe(403);
    const unauth = await request(app).post(`/api/cases/${c.id}/escalations`).send({ reason: "other" });
    expect(unauth.status).toBe(401);
  });
});

describe("filters", () => {
  it("escalated / not escalated split the visible Cases exactly", async () => {
    const all = (await who.iris.get("/cases")).body as { id: number; activeEscalation: unknown }[];
    const yes = (await who.iris.get("/cases?escalated=true")).body as { id: number }[];
    const no = (await who.iris.get("/cases?escalated=false")).body as { id: number }[];
    expect(yes.length).toBeGreaterThan(0);
    expect(yes.length + no.length).toBe(all.length);
    const active = new Set(store.caseEscalations.filter((e) => e.resolvedAt === null).map((e) => e.caseId));
    expect(yes.every((c) => active.has(c.id))).toBe(true);
    expect(no.every((c) => !active.has(c.id))).toBe(true);
    expect((await who.iris.get("/cases?escalated=maybe")).status).toBe(400);
  });

  it("category, uncategorized, and composition with the existing filters", async () => {
    const c = await newCase(who.devon, { category: "registered_agent", priority: "critical" });
    const byCat = (await who.iris.get("/cases?category=registered_agent")).body as { id: number; category: string }[];
    expect(byCat.every((x) => x.category === "registered_agent")).toBe(true);
    expect(byCat.map((x) => x.id)).toContain(c.id);
    const uncategorized = (await who.iris.get("/cases?category=uncategorized")).body as { category: null }[];
    expect(uncategorized.every((x) => x.category === null)).toBe(true);
    expect(uncategorized.length).toBe(store.cases.filter((x) => x.category === null).length);
    const combo = (await who.iris.get("/cases?category=registered_agent&priority=critical&status=intake&escalated=false")).body;
    expect(combo.map((x: { id: number }) => x.id)).toEqual(
      store.cases
        .filter((x) => x.category === "registered_agent" && x.priority === "critical" && x.status === "intake")
        .filter((x) => !store.caseEscalations.some((e) => e.caseId === x.id && e.resolvedAt === null))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((x) => x.id),
    );
    expect((await who.iris.get("/cases?category=unknown")).status).toBe(400);
  });

  it("the default order (Last Modified, newest first) is unchanged by the new filters", async () => {
    for (const q of ["", "?escalated=true", "?escalated=false", "?category=uncategorized"]) {
      const rows = (await who.iris.get(`/cases${q}`)).body as { updatedAt: string }[];
      const times = rows.map((r) => Date.parse(r.updatedAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    }
  });
});

describe("dashboard", () => {
  it("escalation counts follow own / team / all scope; attention lists escalated Cases first", async () => {
    const devonCase = await newCase(who.devon, { priority: "low" });
    await who.devon.post(`/cases/${devonCase.id}/escalations`, { reason: "partner_issue" });
    const activeByOwner = (ids: number[] | null) =>
      store.caseEscalations.filter((e) => {
        if (e.resolvedAt !== null) return false;
        const owner = store.cases.find((c) => c.id === e.caseId)!.ownerUserId;
        return ids === null || (owner !== null && ids.includes(owner));
      }).length;

    const devon = (await who.devon.get("/dashboard")).body.cases;
    expect(devon.summary.activeEscalations).toBe(activeByOwner([uid("Devon Park")]));
    expect(devon.escalated.every((i: { ownerUserId: number }) => i.ownerUserId === uid("Devon Park"))).toBe(true);
    expect(devon.byCategory).toBeUndefined();
    const item = devon.attention.find((i: { id: number }) => i.id === devonCase.id);
    expect(item.reasons[0]).toBe("escalated");
    expect(item.escalation).toMatchObject({ reason: "partner_issue", escalatedByName: "Devon Park" });
    expect(devon.attention[0].escalation).not.toBeNull();

    const nadia = (await who.nadia.get("/dashboard")).body.cases;
    const team = [uid("Nadia Flores"), uid("Devon Park"), uid("Sara Mitchell")];
    expect(nadia.summary.activeEscalations).toBe(activeByOwner(team));
    const sumRows = nadia.workload.reduce((n: number, r: { escalated: number }) => n + r.escalated, 0);
    expect(sumRows).toBe(nadia.summary.activeEscalations);
    for (const e of nadia.recentEscalations) {
      expect(team).toContain(store.cases.find((c) => c.id === e.caseId)!.ownerUserId);
    }

    const rachel = (await who.rachel.get("/dashboard")).body.cases;
    expect(rachel.summary.activeEscalations).toBe(activeByOwner(null));
    const omar = (await who.omar.get("/dashboard")).body.cases;
    expect(omar.summary.activeEscalations).toBe(activeByOwner([uid("Omar Haddad")]));
  });

  it("category breakdown: open Cases in scope, including uncategorized; supervisors and company only", async () => {
    const nadia = (await who.nadia.get("/dashboard")).body.cases;
    const team = [uid("Nadia Flores"), uid("Devon Park"), uid("Sara Mitchell")];
    const open = store.cases.filter((c) => c.status !== "completed" && c.ownerUserId !== null && team.includes(c.ownerUserId));
    for (const row of nadia.byCategory) {
      expect(row.count).toBe(open.filter((c) => c.category === row.category).length);
    }
    expect(nadia.byCategory.reduce((n: number, r: { count: number }) => n + r.count, 0)).toBe(open.length);
    const iris = (await who.iris.get("/dashboard")).body.cases;
    const allOpen = store.cases.filter((c) => c.status !== "completed");
    expect(iris.byCategory.reduce((n: number, r: { count: number }) => n + r.count, 0)).toBe(allOpen.length);
  });

  it("resolving removes the Case from escalated counts but keeps it in recent escalation activity", async () => {
    const c = await newCase(who.devon);
    const esc = (await who.devon.post(`/cases/${c.id}/escalations`, { reason: "other" })).body;
    const before = (await who.devon.get("/dashboard")).body.cases.summary.activeEscalations;
    await who.devon.post(`/cases/${c.id}/escalations/${esc.id}/resolve`, {});
    const after = (await who.devon.get("/dashboard")).body.cases;
    expect(after.summary.activeEscalations).toBe(before - 1);
    expect(after.recentEscalations[0]).toMatchObject({ caseId: c.id, event: "resolved", byName: "Devon Park" });
  });
});
