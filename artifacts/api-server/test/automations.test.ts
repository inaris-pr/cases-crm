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
    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    const seeded = globals.find((g: any) => g.name === SEEDED_GLOBAL);

    const usage = (await request(app).get(`/api/automations/${seeded.id}/usage`).expect(200)).body;
    expect(usage.scope).toBe("global");
    expect(usage.caseCount).toBeGreaterThan(1);

    const own = await createCaseAutomation(13, "Scoped usage");
    const ownUsage = (await request(app).get(`/api/automations/${own.id}/usage`).expect(200)).body;
    expect(ownUsage).toMatchObject({ scope: "case", caseCount: 1, forkedByCaseCount: 0 });
  });
});

describe("customizing a global for one case", () => {
  let globalId: number;

  beforeEach(async () => {
    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    globalId = globals.find((g: any) => g.name === SEEDED_GLOBAL).id;
  });

  it("forks it into the case and hides the original there only", async () => {
    const fork = (
      await request(app)
        .post(`/api/automations/${globalId}/fork`)
        .set(asMe)
        .send({ caseId: 1 })
        .expect(201)
    ).body;

    expect(fork).toMatchObject({
      scope: "case",
      caseId: 1,
      derivedFromAutomationId: globalId,
      name: `${SEEDED_GLOBAL} (this case)`,
    });

    const forCase1 = await listFor(1);
    expect(forCase1.find((r) => r.id === globalId)).toBeUndefined(); // original hidden
    const customized = forCase1.find((r) => r.id === fork.id);
    expect(customized).toMatchObject({ customized: true, inherited: false });

    // Every other case still inherits the untouched original.
    const forCase2 = await listFor(2);
    expect(forCase2.find((r) => r.id === globalId)).toBeTruthy();
    expect(forCase2.find((r) => r.id === fork.id)).toBeUndefined();
  });

  it("deep-copies the graph so the fork shares no structure with the global", async () => {
    const fork = (
      await request(app).post(`/api/automations/${globalId}/fork`).set(asMe).send({ caseId: 2 }).expect(201)
    ).body;
    const original = (await request(app).get(`/api/automations/${globalId}`).expect(200)).body;

    expect(fork.graph).toEqual(original.graph);

    await request(app)
      .patch(`/api/automations/${fork.id}`)
      .set(asMe)
      .send({ graph: { nodes: [{ id: "solo", type: "delay", x: 0, y: 0, config: { duration: "9h" } }], edges: [] } })
      .expect(200);

    const globalAfter = (await request(app).get(`/api/automations/${globalId}`).expect(200)).body;
    expect(globalAfter.graph).toEqual(original.graph);
    expect(globalAfter.graph.nodes).toHaveLength(5);
  });

  it("does not let later edits to the global reach the customized copy", async () => {
    const fork = (
      await request(app).post(`/api/automations/${globalId}/fork`).set(asMe).send({ caseId: 3 }).expect(201)
    ).body;

    await request(app)
      .patch(`/api/automations/${globalId}`)
      .set(asMe)
      .send({ name: "Global edited later", graph: { nodes: [], edges: [] } })
      .expect(200);

    const forkAfter = (await request(app).get(`/api/automations/${fork.id}`).expect(200)).body;
    expect(forkAfter.name).toBe(`${SEEDED_GLOBAL} (this case)`);
    expect(forkAfter.graph.nodes).toHaveLength(5);
  });

  it("refuses to customize the same global twice for one case", async () => {
    await request(app).post(`/api/automations/${globalId}/fork`).set(asMe).send({ caseId: 4 }).expect(201);

    const { body } = await request(app)
      .post(`/api/automations/${globalId}/fork`)
      .set(asMe)
      .send({ caseId: 4 })
      .expect(409);

    expect(body.error).toBe("already_customized");
  });

  it("refuses to customize a case-scoped automation", async () => {
    const own = await createCaseAutomation(5, "Not global");

    const { body } = await request(app)
      .post(`/api/automations/${own.id}/fork`)
      .set(asMe)
      .send({ caseId: 5 })
      .expect(409);

    expect(body.error).toBe("not_global");
  });

  it("404s when the target case does not exist", async () => {
    await request(app)
      .post(`/api/automations/${globalId}/fork`)
      .set(asMe)
      .send({ caseId: 99999 })
      .expect(404);
  });
});

describe("reverting a customized automation to the global", () => {
  it("deletes the fork and restores the inherited original", async () => {
    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    const globalId = globals.find((g: any) => g.name === SEEDED_GLOBAL).id;

    const fork = (
      await request(app).post(`/api/automations/${globalId}/fork`).set(asMe).send({ caseId: 6 }).expect(201)
    ).body;
    expect((await listFor(6)).find((r) => r.id === globalId)).toBeUndefined();

    const { body } = await request(app).post(`/api/automations/${fork.id}/revert`).set(asMe).send({}).expect(200);
    expect(body.restored).toMatchObject({ id: globalId, scope: "global" });

    const after = await listFor(6);
    expect(after.find((r) => r.id === globalId)).toBeTruthy();
    expect(after.find((r) => r.id === fork.id)).toBeUndefined();

    await request(app).get(`/api/automations/${fork.id}`).expect(404);
  });

  it("leaves the global itself untouched", async () => {
    const globals = (await request(app).get("/api/automations?scope=global").expect(200)).body;
    const globalId = globals.find((g: any) => g.name === SEEDED_GLOBAL).id;
    const before = (await request(app).get(`/api/automations/${globalId}`).expect(200)).body;

    const fork = (
      await request(app).post(`/api/automations/${globalId}/fork`).set(asMe).send({ caseId: 7 }).expect(201)
    ).body;
    await request(app)
      .patch(`/api/automations/${fork.id}`)
      .set(asMe)
      .send({ name: "diverged", graph: { nodes: [], edges: [] } })
      .expect(200);
    await request(app).post(`/api/automations/${fork.id}/revert`).set(asMe).send({}).expect(200);

    const after = (await request(app).get(`/api/automations/${globalId}`).expect(200)).body;
    expect(after.name).toBe(before.name);
    expect(after.graph).toEqual(before.graph);
  });

  it("refuses to revert something that is not a customization", async () => {
    const own = await createCaseAutomation(8, "Plain case automation");

    const { body } = await request(app).post(`/api/automations/${own.id}/revert`).set(asMe).send({}).expect(409);
    expect(body.error).toBe("not_customized");
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
