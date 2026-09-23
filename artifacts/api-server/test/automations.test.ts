import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

const SEEDED_GLOBAL = "High-priority intake routing";

const GRAPH = {
  nodes: [
    { id: "a", type: "trigger", x: 10, y: 20, config: { event: "case.created" } },
    { id: "b", type: "notify", x: 300, y: 20, config: { channel: "slack", message: "hi" } },
  ],
  edges: [{ from: "a", to: "b" }],
  viewport: { pan: { x: 12, y: -8 }, zoom: 1.25 },
};

const names = (rows: any[]) => rows.map((r) => r.name).sort();

async function createCaseAutomation(caseId: number, name: string, graph: any = GRAPH) {
  const { body } = await request(app)
    .post(`/api/cases/${caseId}/automations`)
    .set(asMe)
    .send({ name, graph })
    .expect(201);
  return body;
}

async function listFor(caseId: number) {
  const { body } = await request(app).get(`/api/cases/${caseId}/automations`).expect(200);
  return body as any[];
}

let globalSeq = 0;

/**
 * A global automation created by and for the calling test.
 *
 * Tests must NOT share a global. Renaming or deleting one is a legitimate
 * operation, so a test that mutates a shared global silently breaks every
 * later test that looks it up. Each test gets its own.
 */
async function createGlobal(name?: string, graph: any = GRAPH) {
  globalSeq += 1;
  const owned = await createCaseAutomation(1, name ?? `Test global ${globalSeq}`, graph);
  const { body } = await request(app)
    .post(`/api/automations/${owned.id}/promote`)
    .set(asMe)
    .send({})
    .expect(200);
  return body;
}

/**
 * The global created by the seed. Read-only for this suite — nothing here may
 * rename, re-graph or delete it. The explicit throw turns a regression into a
 * diagnosis instead of "Cannot read properties of undefined".
 */
async function seededGlobal() {
  const { body } = await request(app).get("/api/automations?scope=global").expect(200);
  const row = (body as any[]).find((g) => g.name === SEEDED_GLOBAL);
  if (!row) {
    throw new Error(
      `the seeded global "${SEEDED_GLOBAL}" is missing — an earlier test renamed or deleted it. ` +
        "Tests must create their own global with createGlobal() rather than mutating the seeded one.",
    );
  }
  return row;
}

describe("case-scoped automations", () => {
  it("creates one owned by the case", async () => {
    const a = await createCaseAutomation(1, "Case 1 only");

    expect(a).toMatchObject({
      name: "Case 1 only",
      scope: "case",
      caseId: 1,
      enabled: true,
      derivedFromAutomationId: null,
      originCaseId: null,
      ownerName: ME,
      createdByName: ME,
    });
  });

  it("shows it in its own case and nowhere else", async () => {
    await createCaseAutomation(2, "Case 2 only");

    expect(names(await listFor(2))).toContain("Case 2 only");
    expect(names(await listFor(3))).not.toContain("Case 2 only");
    expect(names(await listFor(4))).not.toContain("Case 2 only");
  });

  it("keeps two cases' automations completely independent", async () => {
    const a = await createCaseAutomation(5, "Independent A");
    const b = await createCaseAutomation(6, "Independent B");

    await request(app)
      .patch(`/api/automations/${a.id}`)
      .set(asMe)
      .send({ name: "Independent A renamed" })
      .expect(200);

    const untouched = (await request(app).get(`/api/automations/${b.id}`).expect(200)).body;
    expect(untouched.name).toBe("Independent B");
    expect(names(await listFor(6))).not.toContain("Independent A renamed");
  });

  it("404s for an unknown case", async () => {
    await request(app).get("/api/cases/99999/automations").expect(404);
    await request(app)
      .post("/api/cases/99999/automations")
      .set(asMe)
      .send({ name: "Orphan" })
      .expect(404);
  });

  it("starts from an empty graph when none is supplied", async () => {
    const { body } = await request(app)
      .post("/api/cases/7/automations")
      .set(asMe)
      .send({ name: "Blank" })
      .expect(201);

    expect(body.graph).toEqual({ nodes: [], edges: [], viewport: null });
  });
});

describe("global automations", () => {
  // The only test that touches the seeded global, and it only reads.
  it("offers the seeded global to every case without duplicating rows", async () => {
    for (const caseId of [1, 2, 3, 8, 12]) {
      const rows = await listFor(caseId);
      const seeded = rows.find((r) => r.name === SEEDED_GLOBAL);
      expect(seeded).toBeTruthy();
      expect(seeded.scope).toBe("global");
      expect(seeded.inherited).toBe(true);
      expect(seeded.caseId).toBeNull();
    }

    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    expect(globals.filter((g: any) => g.name === SEEDED_GLOBAL)).toHaveLength(1);
  });

  it("promotes a case automation in place — Apply to all cases", async () => {
    const a = await createCaseAutomation(9, "Renewal reminder");

    const promoted = (
      await request(app).post(`/api/automations/${a.id}/promote`).set(asMe).send({}).expect(200)
    ).body;

    expect(promoted).toMatchObject({ scope: "global", caseId: null, originCaseId: 9 });
    expect(promoted.id).toBe(a.id); // same row, not a copy
  });

  it("makes a promoted automation visible in every existing case", async () => {
    const a = await createCaseAutomation(10, "Filing follow-up");
    await request(app).post(`/api/automations/${a.id}/promote`).set(asMe).send({}).expect(200);

    for (const caseId of [1, 5, 10, 14]) {
      expect(names(await listFor(caseId))).toContain("Filing follow-up");
    }
  });

  it("makes it visible in cases created AFTER the promotion", async () => {
    const a = await createCaseAutomation(11, "Retroactive global");
    await request(app).post(`/api/automations/${a.id}/promote`).set(asMe).send({}).expect(200);

    const newCase = (
      await request(app)
        .post("/api/cases")
        .set(asMe)
        .send({ accountId: 1, title: "Created after the promotion" })
        .expect(201)
    ).body;

    // Nothing was written for this case; the union produces it at read time.
    expect(names(await listFor(newCase.id))).toContain("Retroactive global");
  });

  it("refuses to promote something already global", async () => {
    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    const seeded = globals.find((g: any) => g.name === SEEDED_GLOBAL);

    const { body } = await request(app)
      .post(`/api/automations/${seeded.id}/promote`)
      .set(asMe)
      .send({})
      .expect(409);

    expect(body.error).toBe("already_global");
  });

  it("reports blast radius for the confirmation dialogs", async () => {
    const shared = await createGlobal("Blast radius probe");

    const usage = (await request(app).get(`/api/automations/${shared.id}/usage`).expect(200)).body;
    expect(usage.scope).toBe("global");
    expect(usage.caseCount).toBeGreaterThan(1);

    const own = await createCaseAutomation(13, "Scoped usage");
    const ownUsage = (await request(app).get(`/api/automations/${own.id}/usage`).expect(200)).body;
    expect(ownUsage).toMatchObject({ scope: "case", caseCount: 1, forkedByCaseCount: 0 });
  });
});

describe("choosing scope when creating", () => {
  it("defaults to case scope when scope is omitted (backwards compatible)", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({ name: "Scope omitted" })
      .expect(201);

    expect(body).toMatchObject({ scope: "case", caseId: 1, originCaseId: null });
  });

  it("creates a case-scoped automation visible only in the originating case", async () => {
    const { body } = await request(app)
      .post("/api/cases/2/automations")
      .set(asMe)
      .send({ name: "Explicitly case scoped", scope: "case" })
      .expect(201);

    expect(body).toMatchObject({ scope: "case", caseId: 2, originCaseId: null });
    expect(names(await listFor(2))).toContain("Explicitly case scoped");
    for (const other of [1, 3, 4]) {
      expect(names(await listFor(other))).not.toContain("Explicitly case scoped");
    }
  });

  it("creates a global directly when scope is global", async () => {
    const { body } = await request(app)
      .post("/api/cases/3/automations")
      .set(asMe)
      .send({ name: "Born global", scope: "global" })
      .expect(201);

    expect(body).toMatchObject({
      scope: "global",
      caseId: null,
      originCaseId: 3, // provenance: the case it was created from
      derivedFromAutomationId: null,
    });
  });

  it("is atomic — the single create response is already global, with no promotion", async () => {
    const created = (
      await request(app)
        .post("/api/cases/4/automations")
        .set(asMe)
        .send({ name: "Atomic global", scope: "global" })
        .expect(201)
    ).body;

    // Promotion calls touch(), which moves updatedAt past createdAt. Equal
    // timestamps prove no second mutation ran after the insert.
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.scope).toBe("global");

    // And it is already global in the store, not merely in the response.
    const refetched = (await request(app).get(`/api/automations/${created.id}`).expect(200)).body;
    expect(refetched).toMatchObject({ scope: "global", caseId: null, originCaseId: 4 });
    expect(refetched.updatedAt).toBe(created.createdAt);

    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    expect(globals.filter((g: any) => g.name === "Atomic global")).toHaveLength(1);
  });

  it("makes a newly created global appear in cases that already existed", async () => {
    await request(app)
      .post("/api/cases/5/automations")
      .set(asMe)
      .send({ name: "Global for everyone", scope: "global" })
      .expect(201);

    for (const caseId of [1, 2, 5, 9, 14]) {
      const row = (await listFor(caseId)).find((r) => r.name === "Global for everyone");
      expect(row).toBeTruthy();
      expect(row!.scope).toBe("global");
      expect(row!.inherited).toBe(true);
    }
  });

  it("makes it appear automatically in a case created afterwards", async () => {
    await request(app)
      .post("/api/cases/6/automations")
      .set(asMe)
      .send({ name: "Global before the case existed", scope: "global" })
      .expect(201);

    const laterCase = (
      await request(app)
        .post("/api/cases")
        .set(asMe)
        .send({ accountId: 1, title: "Opened after the global was created" })
        .expect(201)
    ).body;

    // Nothing was written for this case — the union produces it at read time.
    expect(names(await listFor(laterCase.id))).toContain("Global before the case existed");
  });

  it("rejects an unknown scope with 400", async () => {
    for (const scope of ["everything", "all", "CASE", "", null, 7]) {
      const { body } = await request(app)
        .post("/api/cases/1/automations")
        .set(asMe)
        .send({ name: "Bad scope", scope })
        .expect(400);
      expect(body.error).toBe("validation_error");
    }
  });

  it("still 404s for an unknown case regardless of scope", async () => {
    await request(app)
      .post("/api/cases/99999/automations")
      .set(asMe)
      .send({ name: "Orphan global", scope: "global" })
      .expect(404);
  });
});

describe("customizing a global for one case", () => {
  // Each test creates its own global. Sharing one would make the suite
  // order-dependent: the "later edits" test below deliberately renames and
  // re-graphs the global it is given.
  it("forks it into the case and hides the original there only", async () => {
    const shared = await createGlobal("Customize: hide original");

    const fork = (
      await request(app)
        .post(`/api/automations/${shared.id}/fork`)
        .set(asMe)
        .send({ caseId: 2 })
        .expect(201)
    ).body;

    expect(fork).toMatchObject({
      scope: "case",
      caseId: 2,
      derivedFromAutomationId: shared.id,
      name: "Customize: hide original (this case)",
    });

    const forCase2 = await listFor(2);
    expect(forCase2.find((r) => r.id === shared.id)).toBeUndefined(); // original hidden
    const customized = forCase2.find((r) => r.id === fork.id);
    expect(customized).toMatchObject({ customized: true, inherited: false });

    // Every other case still inherits the untouched original.
    const forCase3 = await listFor(3);
    expect(forCase3.find((r) => r.id === shared.id)).toBeTruthy();
    expect(forCase3.find((r) => r.id === fork.id)).toBeUndefined();
  });

  it("deep-copies the graph so the fork shares no structure with the global", async () => {
    const shared = await createGlobal("Customize: deep copy");
    const original = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;

    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 4 }).expect(201)
    ).body;
    expect(fork.graph).toEqual(original.graph);

    await request(app)
      .patch(`/api/automations/${fork.id}`)
      .set(asMe)
      .send({ graph: { nodes: [{ id: "solo", type: "delay", x: 0, y: 0, config: { duration: "9h" } }], edges: [] } })
      .expect(200);

    const globalAfter = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;
    expect(globalAfter.graph).toEqual(original.graph);
    expect(globalAfter.graph.nodes).toHaveLength(GRAPH.nodes.length);
  });

  it("does not let later edits to the global reach the customized copy", async () => {
    const shared = await createGlobal("Customize: later edits");
    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 5 }).expect(201)
    ).body;

    // Destructive on purpose — and safe, because this global belongs to this test.
    await request(app)
      .patch(`/api/automations/${shared.id}`)
      .set(asMe)
      .send({ name: "Global edited later", graph: { nodes: [], edges: [] } })
      .expect(200);

    const forkAfter = (await request(app).get(`/api/automations/${fork.id}`).expect(200)).body;
    expect(forkAfter.name).toBe("Customize: later edits (this case)");
    expect(forkAfter.graph).toEqual(GRAPH);
    expect(forkAfter.graph.nodes).toHaveLength(GRAPH.nodes.length);
  });

  it("refuses to customize the same global twice for one case", async () => {
    const shared = await createGlobal("Customize: twice");
    await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 6 }).expect(201);

    const { body } = await request(app)
      .post(`/api/automations/${shared.id}/fork`)
      .set(asMe)
      .send({ caseId: 6 })
      .expect(409);

    expect(body.error).toBe("already_customized");
  });

  it("refuses to customize a case-scoped automation", async () => {
    const own = await createCaseAutomation(7, "Not global");

    const { body } = await request(app)
      .post(`/api/automations/${own.id}/fork`)
      .set(asMe)
      .send({ caseId: 7 })
      .expect(409);

    expect(body.error).toBe("not_global");
  });

  it("404s when the target case does not exist", async () => {
    const shared = await createGlobal("Customize: bad case");

    await request(app)
      .post(`/api/automations/${shared.id}/fork`)
      .set(asMe)
      .send({ caseId: 99999 })
      .expect(404);
  });

  it("leaves the seeded global untouched throughout", async () => {
    // Sentinel: proves nothing in this describe mutated shared seed state.
    const seeded = await seededGlobal();
    expect(seeded.name).toBe(SEEDED_GLOBAL);
    expect(seeded.nodeCount).toBe(5);
  });
});

describe("editing a global automation", () => {
  const EDITED = {
    nodes: [
      { id: "g1", type: "trigger", x: 0, y: 0, config: { event: "case.updated" } },
      { id: "g2", type: "assign", x: 300, y: 0, config: { assignee: "team:renewals" } },
      { id: "g3", type: "notify", x: 600, y: 0, config: { channel: "email", message: "assigned" } },
    ],
    edges: [
      { from: "g1", to: "g2" },
      { from: "g2", to: "g3" },
    ],
    viewport: null,
  };

  it("saves a renamed and re-graphed global", async () => {
    const shared = await createGlobal("Editable global");

    const saved = (
      await request(app)
        .patch(`/api/automations/${shared.id}`)
        .set(asMe)
        .send({ name: "Editable global renamed", graph: EDITED })
        .expect(200)
    ).body;

    expect(saved).toMatchObject({ id: shared.id, scope: "global", caseId: null });
    expect(saved.name).toBe("Editable global renamed");
    expect(saved.graph).toEqual(EDITED);
    expect(saved.lastModifiedByName).toBe(ME);
  });

  it("persists across a reopen rather than only in the response", async () => {
    const shared = await createGlobal("Reopen me");
    await request(app)
      .patch(`/api/automations/${shared.id}`)
      .set(asMe)
      .send({ name: "Reopened", graph: EDITED })
      .expect(200);

    const reopened = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;
    expect(reopened.name).toBe("Reopened");
    expect(reopened.graph).toEqual(EDITED);
    expect(reopened.graph.nodes).toHaveLength(3);
  });

  it("shows the update in every other case without duplicating the record", async () => {
    const shared = await createGlobal("Seen everywhere");
    await request(app)
      .patch(`/api/automations/${shared.id}`)
      .set(asMe)
      .send({ name: "Seen everywhere v2", graph: EDITED })
      .expect(200);

    for (const caseId of [2, 3, 11, 14]) {
      const rows = await listFor(caseId);
      const hits = rows.filter((r) => r.id === shared.id);
      expect(hits).toHaveLength(1); // one shared row, never copied per case
      expect(hits[0]).toMatchObject({
        name: "Seen everywhere v2",
        scope: "global",
        nodeCount: 3,
        edgeCount: 2,
      });

      // And the graph itself resolves from that other case.
      const detail = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;
      expect(detail.graph).toEqual(EDITED);
    }

    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    expect(globals.filter((g: any) => g.id === shared.id)).toHaveLength(1);
  });

  it("leaves a case's customized copy untouched", async () => {
    const shared = await createGlobal("Edited after a fork");
    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 12 }).expect(201)
    ).body;

    await request(app)
      .patch(`/api/automations/${shared.id}`)
      .set(asMe)
      .send({ name: "Global moved on", graph: EDITED })
      .expect(200);

    const forkAfter = (await request(app).get(`/api/automations/${fork.id}`).expect(200)).body;
    expect(forkAfter.name).toBe("Edited after a fork (this case)");
    expect(forkAfter.graph).toEqual(GRAPH);
    expect(forkAfter.scope).toBe("case");

    // Case 12 still sees its own copy, not the edited global.
    const rows = await listFor(12);
    expect(rows.find((r) => r.id === shared.id)).toBeUndefined();
    expect(rows.find((r) => r.id === fork.id)).toBeTruthy();
  });

  it("reports the blast radius the confirmation shows", async () => {
    const shared = await createGlobal("Counted global");
    await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 13 }).expect(201);

    const usage = (await request(app).get(`/api/automations/${shared.id}/usage`).expect(200)).body;
    expect(usage.scope).toBe("global");
    expect(usage.forkedByCaseCount).toBe(1);
    // The forking case is excluded from the count of cases the edit reaches.
    expect(usage.caseCount).toBeGreaterThan(0);
  });

  it("still saves a case-scoped automation exactly as before", async () => {
    const own = await createCaseAutomation(14, "Unchanged case save");

    const saved = (
      await request(app)
        .patch(`/api/automations/${own.id}`)
        .set(asMe)
        .send({ name: "Unchanged case save v2", graph: EDITED })
        .expect(200)
    ).body;

    expect(saved).toMatchObject({ scope: "case", caseId: 14, name: "Unchanged case save v2" });
    expect(saved.graph).toEqual(EDITED);

    const reopened = (await request(app).get(`/api/automations/${own.id}`).expect(200)).body;
    expect(reopened.graph).toEqual(EDITED);
    expect(names(await listFor(15))).not.toContain("Unchanged case save v2");
  });
});

describe("reverting a customized automation to the global", () => {
  it("deletes the fork and restores the inherited original", async () => {
    const shared = await createGlobal("Revert: restore");

    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 8 }).expect(201)
    ).body;
    expect((await listFor(8)).find((r) => r.id === shared.id)).toBeUndefined();

    const { body } = await request(app).post(`/api/automations/${fork.id}/revert`).set(asMe).send({}).expect(200);
    expect(body.restored).toMatchObject({ id: shared.id, scope: "global" });

    const after = await listFor(8);
    expect(after.find((r) => r.id === shared.id)).toBeTruthy();
    expect(after.find((r) => r.id === fork.id)).toBeUndefined();

    await request(app).get(`/api/automations/${fork.id}`).expect(404);
  });

  it("leaves the global itself untouched", async () => {
    const shared = await createGlobal("Revert: global intact");
    const before = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;

    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 9 }).expect(201)
    ).body;
    await request(app)
      .patch(`/api/automations/${fork.id}`)
      .set(asMe)
      .send({ name: "diverged", graph: { nodes: [], edges: [] } })
      .expect(200);
    await request(app).post(`/api/automations/${fork.id}/revert`).set(asMe).send({}).expect(200);

    const after = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;
    expect(after.name).toBe(before.name);
    expect(after.graph).toEqual(before.graph);
  });

  it("refuses to revert something that is not a customization", async () => {
    const own = await createCaseAutomation(10, "Plain case automation");

    const { body } = await request(app).post(`/api/automations/${own.id}/revert`).set(asMe).send({}).expect(409);
    expect(body.error).toBe("not_customized");
  });

  it("refuses to revert when the original global has since been deleted", async () => {
    const shared = await createGlobal("Revert: original deleted");
    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 11 }).expect(201)
    ).body;

    await request(app).delete(`/api/automations/${shared.id}`).expect(204);

    const { body } = await request(app).post(`/api/automations/${fork.id}/revert`).set(asMe).send({}).expect(409);
    expect(body.error).toBe("not_customized"); // provenance was cleared by the delete
  });
});

describe("deleting automations", () => {
  it("removes a global from every case at once", async () => {
    const created = await createCaseAutomation(9, "Short-lived global");
    await request(app).post(`/api/automations/${created.id}/promote`).set(asMe).send({}).expect(200);
    expect(names(await listFor(2))).toContain("Short-lived global");

    await request(app).delete(`/api/automations/${created.id}`).expect(204);

    for (const caseId of [1, 2, 9]) {
      expect(names(await listFor(caseId))).not.toContain("Short-lived global");
    }
  });

  it("keeps customized copies alive and clears their dangling provenance", async () => {
    const created = await createCaseAutomation(10, "Global with a fork");
    await request(app).post(`/api/automations/${created.id}/promote`).set(asMe).send({}).expect(200);
    const fork = (
      await request(app).post(`/api/automations/${created.id}/fork`).set(asMe).send({ caseId: 11 }).expect(201)
    ).body;

    await request(app).delete(`/api/automations/${created.id}`).expect(204);

    const survivor = (await request(app).get(`/api/automations/${fork.id}`).expect(200)).body;
    expect(survivor.derivedFromAutomationId).toBeNull();
    expect(names(await listFor(11))).toContain("Global with a fork (this case)");
  });

  it("removes a case automation from its own case only", async () => {
    const a = await createCaseAutomation(12, "Disposable");
    await request(app).delete(`/api/automations/${a.id}`).expect(204);

    expect(names(await listFor(12))).not.toContain("Disposable");
    await request(app).get(`/api/automations/${a.id}`).expect(404);
  });

  it("404s on an unknown automation", async () => {
    await request(app).delete("/api/automations/99999").expect(404);
    await request(app).get("/api/automations/99999").expect(404);
    await request(app).get("/api/automations/99999/usage").expect(404);
    await request(app).post("/api/automations/99999/promote").set(asMe).send({}).expect(404);
    await request(app).post("/api/automations/99999/revert").set(asMe).send({}).expect(404);
  });
});

describe("scope lifecycle end to end", () => {
  const FORK_EDIT = {
    nodes: [{ id: "only", type: "delay", x: 5, y: 5, config: { duration: "48h" } }],
    edges: [],
    viewport: null,
  };

  it("runs create -> promote -> customize -> edit -> revert -> delete without leaking between cases", async () => {
    // 1. A case automation, invisible elsewhere.
    const own = await createCaseAutomation(1, "Lifecycle automation");
    expect(names(await listFor(2))).not.toContain("Lifecycle automation");

    // 2. Apply to all cases — one row, promoted in place.
    const promoted = (
      await request(app).post(`/api/automations/${own.id}/promote`).set(asMe).send({}).expect(200)
    ).body;
    expect(promoted.id).toBe(own.id);
    expect(promoted).toMatchObject({ scope: "global", caseId: null, originCaseId: 1 });
    for (const caseId of [1, 2, 7]) {
      expect((await listFor(caseId)).filter((r) => r.id === own.id)).toHaveLength(1);
    }

    // 3. Case 2 customizes it: its copy replaces the global there only.
    const fork = (
      await request(app).post(`/api/automations/${own.id}/fork`).set(asMe).send({ caseId: 2 }).expect(201)
    ).body;
    expect((await listFor(2)).find((r) => r.id === own.id)).toBeUndefined();
    expect((await listFor(7)).find((r) => r.id === own.id)).toBeTruthy();

    // 4. Editing the copy leaves the global alone, and vice versa.
    await request(app)
      .patch(`/api/automations/${fork.id}`)
      .set(asMe)
      .send({ name: "Lifecycle, case 2 flavour", graph: FORK_EDIT })
      .expect(200);
    await request(app)
      .patch(`/api/automations/${own.id}`)
      .set(asMe)
      .send({ name: "Lifecycle automation v2" })
      .expect(200);

    const forkNow = (await request(app).get(`/api/automations/${fork.id}`).expect(200)).body;
    const globalNow = (await request(app).get(`/api/automations/${own.id}`).expect(200)).body;
    expect(forkNow.name).toBe("Lifecycle, case 2 flavour");
    expect(forkNow.graph).toEqual(FORK_EDIT);
    expect(globalNow.name).toBe("Lifecycle automation v2");
    expect(globalNow.graph).toEqual(GRAPH);

    // 5. Revert: the copy goes, the global comes back, unchanged.
    const reverted = (
      await request(app).post(`/api/automations/${fork.id}/revert`).set(asMe).send({}).expect(200)
    ).body;
    expect(reverted.restored.id).toBe(own.id);
    await request(app).get(`/api/automations/${fork.id}`).expect(404);
    const afterRevert = (await request(app).get(`/api/automations/${own.id}`).expect(200)).body;
    expect(afterRevert.name).toBe("Lifecycle automation v2");
    expect(afterRevert.graph).toEqual(GRAPH);
    expect((await listFor(2)).find((r) => r.id === own.id)).toBeTruthy();

    // 6. Delete the global: gone everywhere.
    await request(app).delete(`/api/automations/${own.id}`).expect(204);
    for (const caseId of [1, 2, 7]) {
      expect((await listFor(caseId)).find((r) => r.id === own.id)).toBeUndefined();
    }
  });

  it("keeps customized copies when their global is deleted, as independent automations", async () => {
    const shared = await createGlobal("Global with two forks");
    const forkA = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 3 }).expect(201)
    ).body;
    const forkB = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 4 }).expect(201)
    ).body;

    const usage = (await request(app).get(`/api/automations/${shared.id}/usage`).expect(200)).body;
    expect(usage.forkedByCaseCount).toBe(2);

    await request(app).delete(`/api/automations/${shared.id}`).expect(204);

    for (const [forkId, caseId] of [[forkA.id, 3], [forkB.id, 4]] as const) {
      const survivor = (await request(app).get(`/api/automations/${forkId}`).expect(200)).body;
      expect(survivor.scope).toBe("case");
      expect(survivor.caseId).toBe(caseId);
      // Provenance is cleared, so it is a standalone automation now.
      expect(survivor.derivedFromAutomationId).toBeNull();
      expect(survivor.graph).toEqual(GRAPH);
      expect((await listFor(caseId)).find((r) => r.id === forkId)).toBeTruthy();
    }
  });

  it("does not let a customized copy drift back into the global, in either direction", async () => {
    const shared = await createGlobal("Isolation probe");
    const fork = (
      await request(app).post(`/api/automations/${shared.id}/fork`).set(asMe).send({ caseId: 5 }).expect(201)
    ).body;

    // Ten alternating edits; neither side should ever see the other's.
    for (let i = 0; i < 5; i++) {
      await request(app)
        .patch(`/api/automations/${fork.id}`)
        .set(asMe)
        .send({ name: `fork v${i}` })
        .expect(200);
      await request(app)
        .patch(`/api/automations/${shared.id}`)
        .set(asMe)
        .send({ name: `global v${i}` })
        .expect(200);
    }

    const forkFinal = (await request(app).get(`/api/automations/${fork.id}`).expect(200)).body;
    const globalFinal = (await request(app).get(`/api/automations/${shared.id}`).expect(200)).body;
    expect(forkFinal.name).toBe("fork v4");
    expect(globalFinal.name).toBe("global v4");
    expect(forkFinal.id).not.toBe(globalFinal.id);
    expect(forkFinal.scope).toBe("case");
    expect(globalFinal.scope).toBe("global");
  });

  it("gives a case created after a promotion the promoted automation", async () => {
    const own = await createCaseAutomation(6, "Promoted before the case existed");
    await request(app).post(`/api/automations/${own.id}/promote`).set(asMe).send({}).expect(200);

    const later = (
      await request(app)
        .post("/api/cases")
        .set(asMe)
        .send({ accountId: 1, title: "Opened after the promotion" })
        .expect(201)
    ).body;

    expect(names(await listFor(later.id))).toContain("Promoted before the case existed");
  });

  it("deletes a case automation without touching any other case", async () => {
    const a = await createCaseAutomation(8, "Delete me, case 8");
    const b = await createCaseAutomation(9, "Keep me, case 9");

    await request(app).delete(`/api/automations/${a.id}`).expect(204);

    expect(names(await listFor(8))).not.toContain("Delete me, case 8");
    expect(names(await listFor(9))).toContain("Keep me, case 9");
    const kept = (await request(app).get(`/api/automations/${b.id}`).expect(200)).body;
    expect(kept.name).toBe("Keep me, case 9");
  });

  it("refuses to promote a global and to revert something never customized", async () => {
    const shared = await createGlobal("Already global");
    await request(app).post(`/api/automations/${shared.id}/promote`).set(asMe).send({}).expect(409);

    const plain = await createCaseAutomation(10, "Never customized");
    await request(app).post(`/api/automations/${plain.id}/revert`).set(asMe).send({}).expect(409);
  });
});

describe("graph persistence and validation", () => {
  it("round-trips a graph losslessly", async () => {
    const a = await createCaseAutomation(14, "Round trip");
    const fetched = (await request(app).get(`/api/automations/${a.id}`).expect(200)).body;

    expect(fetched.graph).toEqual(GRAPH);
    expect(fetched.graph.nodes[0].config).toEqual({ event: "case.created" });
    expect(fetched.graph.viewport).toEqual({ pan: { x: 12, y: -8 }, zoom: 1.25 });
  });

  it("reports node and edge counts on the list without sending the graph", async () => {
    await createCaseAutomation(15, "Counted");
    const row = (await listFor(15)).find((r) => r.name === "Counted");

    expect(row).toMatchObject({ nodeCount: 2, edgeCount: 1 });
    expect(row).not.toHaveProperty("graph");
  });

  it("rejects an unknown node type", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({ name: "Bad node", graph: { nodes: [{ id: "x", type: "teleport", x: 0, y: 0, config: {} }], edges: [] } })
      .expect(400);

    expect(body.error).toBe("validation_error");
  });

  it("rejects an edge pointing at a node that does not exist", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({
        name: "Dangling edge",
        graph: { nodes: [{ id: "only", type: "delay", x: 0, y: 0, config: {} }], edges: [{ from: "only", to: "ghost" }] },
      })
      .expect(400);

    expect(JSON.stringify(body.issues)).toContain("ghost");
  });

  it("rejects duplicate node ids", async () => {
    await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({
        name: "Dupe ids",
        graph: {
          nodes: [
            { id: "same", type: "delay", x: 0, y: 0, config: {} },
            { id: "same", type: "notify", x: 10, y: 10, config: {} },
          ],
          edges: [],
        },
      })
      .expect(400);
  });

  it("rejects non-finite coordinates", async () => {
    await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({ name: "Bad coords", graph: { nodes: [{ id: "n", type: "delay", x: "over there", y: 0, config: {} }], edges: [] } })
      .expect(400);
  });

  it("rejects an empty or overlong name", async () => {
    await request(app).post("/api/cases/1/automations").set(asMe).send({ name: "" }).expect(400);
    await request(app).post("/api/cases/1/automations").set(asMe).send({ name: "x".repeat(81) }).expect(400);
  });

  it("trims the name", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({ name: "   Padded   " })
      .expect(201);

    expect(body.name).toBe("Padded");
  });

  it("accepts and round-trips an explicitly null viewport", async () => {
    // EMPTY_GRAPH on the client is { nodes: [], edges: [], viewport: null },
    // so this is the exact shape the Case Automations tab posts and patches.
    const created = (
      await request(app)
        .post("/api/cases/1/automations")
        .set(asMe)
        .send({ name: "Null viewport", graph: { nodes: [], edges: [], viewport: null } })
        .expect(201)
    ).body;
    expect(created.graph.viewport).toBeNull();

    const patched = (
      await request(app)
        .patch(`/api/automations/${created.id}`)
        .set(asMe)
        .send({ graph: { nodes: [], edges: [], viewport: null } })
        .expect(200)
    ).body;
    expect(patched.graph.viewport).toBeNull();
  });

  it("accepts an empty graph as a work in progress", async () => {
    await request(app)
      .post("/api/cases/1/automations")
      .set(asMe)
      .send({ name: "Empty but valid", graph: { nodes: [], edges: [] } })
      .expect(201);
  });

  it("stamps the modifier on update", async () => {
    const a = await createCaseAutomation(1, "Stamped");
    const updated = (
      await request(app).patch(`/api/automations/${a.id}`).set(asMe).send({ enabled: false }).expect(200)
    ).body;

    expect(updated.enabled).toBe(false);
    expect(updated.lastModifiedByName).toBe(ME);
    expect(Date.parse(updated.updatedAt)).not.toBeNaN();
  });
});
