import { describe, it, expect } from "vitest";
import request from "supertest";
import { store } from "../src/store";
import { createTestApp, loginAs } from "./helpers/app";
import { apiAs } from "./helpers/api";

/**
 * Phase 7 follow-up — the Case Thread as a unified timeline:
 * GET /api/cases/:id/feed merges human comments with system activity.
 */
const app = createTestApp();
const who = {
  iris: apiAs(app, loginAs("iris@example.com")), // System Owner
  devon: apiAs(app, loginAs("devon@example.com")), // CSR
  sara: apiAs(app, loginAs("sara@example.com")), // CSR
  nadia: apiAs(app, loginAs("nadia@example.com")), // CSR Supervisor (Devon, Sara)
  leo: apiAs(app, loginAs("leo@example.com")), // Business Advisor
  tessa: apiAs(app, loginAs("tessa@example.com")), // HR
};
const uid = (name: string) => store.users.find((u) => u.name === name)!.id;
type Entry = { key: string; type: string; at: string; actor: { userId: number | null; name: string } | null } & Record<string, any>;

async function feed(api: (typeof who)[keyof typeof who], caseId: number) {
  const res = await api.get(`/cases/${caseId}/feed`);
  expect(res.status).toBe(200);
  expect(res.body.count).toBe(res.body.entries.length);
  return res.body.entries as Entry[];
}
const ofType = (entries: Entry[], type: string) => entries.filter((e) => e.type === type);
async function newCase(api: (typeof who)[keyof typeof who], extra: Record<string, unknown> = {}) {
  const res = await api.post("/cases", { title: `Feed ${Math.random()}`, accountId: 1, ...extra });
  expect(res.status).toBe(201);
  return res.body.id as number;
}
const tick = () => new Promise((r) => setTimeout(r, 3));

describe("the feed", () => {
  it("merges comments and system activity, oldest first, deterministically", async () => {
    const id = await newCase(who.devon);
    await who.devon.post(`/cases/${id}/thread`, { body: "First note" });
    await tick();
    await who.devon.patch(`/cases/${id}`, { priority: "high" });
    await tick();
    await who.devon.post(`/cases/${id}/thread`, { body: "Second note" });
    const entries = await feed(who.devon, id);
    expect(entries.map((e) => e.type)).toEqual(["comment", "priority_change", "comment"]);
    expect(entries[0].comment.body).toBe("First note");
    const times = entries.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(await feed(who.devon, id)).toEqual(entries);
  });

  it("GET /thread still returns human comments only, as before", async () => {
    const id = await newCase(who.devon);
    await who.devon.post(`/cases/${id}/thread`, { body: "Only me" });
    await who.devon.patch(`/cases/${id}`, { category: "compliance" });
    const res = await who.devon.get(`/cases/${id}/thread`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ body: "Only me", authorUserId: uid("Devon Park") });
  });

  it("the seed's history appears as it was recorded — nothing invented", async () => {
    const entries = await feed(who.iris, 1);
    const tasks = store.tasks.filter((t) => t.caseId === 1);
    expect(ofType(entries, "task_created")).toHaveLength(tasks.length);
    // Seed tasks never recorded their creator or completion.
    expect(ofType(entries, "task_created").every((e) => e.actor === null)).toBe(true);
    expect(ofType(entries, "task_completed")).toEqual([]);
    expect(ofType(entries, "document_uploaded")).toHaveLength(store.documents.filter((d) => d.caseId === 1).length);
    expect(ofType(entries, "comment")).toHaveLength(store.threadEntries.filter((t) => t.caseId === 1).length);
  });
});

describe("case changes", () => {
  it("category: one entry per real change, none on a no-op; clearing is a change", async () => {
    const id = await newCase(who.devon, { category: "compliance" });
    await who.devon.patch(`/cases/${id}`, { category: "filing_correction" });
    await who.devon.patch(`/cases/${id}`, { category: "filing_correction" }); // no-op
    await who.devon.patch(`/cases/${id}`, { category: null });
    const entries = ofType(await feed(who.devon, id), "category_change");
    expect(entries.map((e) => [e.from, e.to])).toEqual([["compliance", "filing_correction"], ["filing_correction", null]]);
    expect(entries[0].actor).toEqual({ userId: uid("Devon Park"), name: "Devon Park" });
  });

  it("priority: recorded with the session's employee; spoofed identity ignored; no-op ignored", async () => {
    const id = await newCase(who.devon);
    await who.devon.patch(`/cases/${id}`, { priority: "medium" }); // default is medium: no-op
    await who.devon.patch(`/cases/${id}`, { priority: "high", actorUserId: 1, actorName: "Iris Burgos" });
    const entries = ofType(await feed(who.devon, id), "priority_change");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ from: "medium", to: "high", actor: { userId: uid("Devon Park"), name: "Devon Park" } });
  });

  it("title, description and tag edits are not timeline events", async () => {
    const id = await newCase(who.devon);
    await who.devon.patch(`/cases/${id}`, { title: "Renamed", description: "More", tags: ["x"] });
    expect(await feed(who.devon, id)).toEqual([]);
  });

  it("reassignment: owners by id, actor = session, historical names kept after a rename", async () => {
    const id = await newCase(who.devon);
    const res = await who.nadia.put(`/cases/${id}/owner`, { ownerUserId: uid("Sara Mitchell") });
    expect(res.status).toBe(200);
    const [entry] = ofType(await feed(who.nadia, id), "owner_change");
    expect(entry).toMatchObject({
      fromUserId: uid("Devon Park"), fromName: "Devon Park",
      toUserId: uid("Sara Mitchell"), toName: "Sara Mitchell",
      actor: { userId: uid("Nadia Flores"), name: "Nadia Flores" },
    });
    // Reassigning to the current owner changes nothing and records nothing.
    await who.nadia.put(`/cases/${id}/owner`, { ownerUserId: uid("Sara Mitchell") });
    expect(ofType(await feed(who.nadia, id), "owner_change")).toHaveLength(1);
    // A later rename does not rewrite history.
    const devon = store.users.find((u) => u.id === uid("Devon Park"))!;
    devon.name = "Devon Park-Renamed";
    try {
      expect(ofType(await feed(who.nadia, id), "owner_change")[0].fromName).toBe("Devon Park");
    } finally {
      devon.name = "Devon Park";
    }
  });

  it("lifecycle entries come from the Phase 7 history — each change exactly once", async () => {
    const id = await newCase(who.devon);
    await who.devon.patch(`/cases/${id}`, { status: "in_progress" });
    await who.devon.patch(`/cases/${id}`, { status: "completed" });
    await who.nadia.patch(`/cases/${id}`, { status: "review" });
    await who.devon.patch(`/cases/${id}`, { status: "completed" });
    const entries = ofType(await feed(who.devon, id), "status_change");
    const events = store.caseStatusEvents.filter((e) => e.caseId === id);
    expect(entries.map((e) => e.key)).toEqual(events.map((e) => `status:${e.id}`));
    expect(entries.map((e) => e.kind)).toEqual(["status_change", "closed", "reopened", "closed"]);
    expect(entries[2].actor!.name).toBe("Nadia Flores");
    // The lifecycle card still reads the same authoritative events.
    expect((await who.devon.get(`/cases/${id}`)).body.statusHistory).toHaveLength(4);
  });

  it("escalation raised and resolved both appear; the raised entry stays after resolution", async () => {
    const id = await newCase(who.sara);
    const esc = (await who.devon.post(`/cases/${id}/escalations`, { reason: "deadline_risk", note: "Filing window closes Friday" })).body;
    await who.nadia.post(`/cases/${id}/escalations/${esc.id}/resolve`, {});
    const entries = await feed(who.sara, id);
    expect(ofType(entries, "escalation_created")[0]).toMatchObject({
      reason: "deadline_risk", note: "Filing window closes Friday", actor: { name: "Devon Park" },
    });
    expect(ofType(entries, "escalation_resolved")[0]).toMatchObject({ reason: "deadline_risk", actor: { name: "Nadia Flores" } });
  });
});

describe("tasks and documents", () => {
  it("task created and completed carry the real actors; reopen and re-complete are kept", async () => {
    const id = await newCase(who.devon);
    const task = (await who.devon.post("/tasks", { caseId: id, title: "Prepare amendment filing" })).body;
    expect(task).toMatchObject({ createdByUserId: uid("Devon Park"), completedAt: null });
    const done = (await who.nadia.patch(`/tasks/${task.id}`, { status: "completed", completedByUserId: 1 })).body;
    expect(done).toMatchObject({ completedByUserId: uid("Nadia Flores"), completedByName: "Nadia Flores" });
    expect(done.completedAt).not.toBeNull();
    const reopened = (await who.devon.patch(`/tasks/${task.id}`, { status: "in_progress" })).body;
    expect(reopened.completedAt).toBeNull();
    await who.devon.patch(`/tasks/${task.id}`, { status: "completed" });
    await who.devon.patch(`/tasks/${task.id}`, { title: "Renamed task" }); // not an event
    const entries = await feed(who.devon, id);
    expect(entries.map((e) => e.type)).toEqual(["task_created", "task_completed", "task_reopened", "task_completed"]);
    expect(entries[0]).toMatchObject({ title: "Renamed task", actor: { name: "Devon Park" } }); // current title
    expect(entries[1]).toMatchObject({ title: "Prepare amendment filing", actor: { name: "Nadia Flores" } }); // title as completed
    expect(entries[2]).toMatchObject({ toStatus: "in_progress", actor: { name: "Devon Park" } });
  });

  it("changes recorded in the same millisecond keep the order they happened in", async () => {
    const id = await newCase(who.devon);
    const task = (await who.devon.post("/tasks", { caseId: id, title: "Same instant" })).body;
    await who.devon.patch(`/tasks/${task.id}`, { status: "completed" });
    await who.devon.patch(`/tasks/${task.id}`, { status: "pending" });
    await who.devon.patch(`/tasks/${task.id}`, { status: "completed" });
    // Force every recorded change onto one timestamp.
    const same = store.caseActivities.filter((a) => a.caseId === id);
    for (const a of same) a.at = same[0].at;
    expect((await feed(who.devon, id)).filter((e) => e.type !== "task_created").map((e) => e.type)).toEqual([
      "task_completed", "task_reopened", "task_completed",
    ]);
  });

  it("a task created already completed records its completion", async () => {
    const id = await newCase(who.devon);
    await who.devon.post("/tasks", { caseId: id, title: "Already done", status: "completed" });
    expect((await feed(who.devon, id)).map((e) => e.type)).toEqual(["task_created", "task_completed"]);
  });

  it("document uploaded: uploader, and a link only to the document's own http(s) URL", async () => {
    const id = await newCase(who.devon);
    const good = (await who.devon.post("/documents", { caseId: id, filename: "Articles of Organization.pdf", fileUrl: "https://example.com/docs/aoo.pdf" })).body;
    await who.devon.post("/documents", { caseId: id, filename: "bad.pdf", fileUrl: "javascript:alert(1)" });
    await who.devon.post("/documents", { caseId: id, filename: "local.pdf", fileUrl: "/files/local.pdf" });
    const docs = ofType(await feed(who.devon, id), "document_uploaded");
    expect(docs[0]).toMatchObject({
      documentId: good.id, filename: "Articles of Organization.pdf", href: "https://example.com/docs/aoo.pdf",
      actor: { userId: uid("Devon Park"), name: "Devon Park" },
    });
    expect(store.documents.find((d) => d.id === good.id)!.fileUrl).toBe(docs[0].href);
    expect(docs[1].href).toBeNull();
    expect(docs[2].href).toBeNull();
  });
});

describe("calls", () => {
  const log = (api: (typeof who)[keyof typeof who], id: number, direction: string, channel = "phone", summary = "Call") =>
    api.post(`/cases/${id}/contacts`, { direction, channel, summary, contact: "Client" });

  it("outgoing and incoming phone calls each aggregate into ONE entry; a new call updates it and moves it", async () => {
    const id = await newCase(who.devon);
    await log(who.devon, id, "outbound", "phone", "First outbound");
    await tick();
    await log(who.sara, id, "outbound", "phone", "Second outbound");
    await tick();
    await log(who.sara, id, "inbound", "phone", "Client called");
    await tick();
    await who.devon.post(`/cases/${id}/thread`, { body: "Between calls" });
    let entries = await feed(who.devon, id);
    expect(entries.map((e) => e.type)).toEqual(["calls_outgoing_summary", "calls_incoming_summary", "comment"]);
    const out1 = ofType(entries, "calls_outgoing_summary")[0];
    expect(out1).toMatchObject({ count: 2, latest: { summary: "Second outbound", by: { name: "Sara Mitchell" } } });
    expect(out1.previous.map((p: { by: { name: string } }) => p.by.name)).toEqual(["Devon Park"]);
    expect(ofType(entries, "calls_incoming_summary")[0]).toMatchObject({ count: 1, latest: { summary: "Client called" } });

    await tick();
    const third = (await log(who.devon, id, "outbound", "phone", "Third outbound")).body;
    entries = await feed(who.devon, id);
    expect(ofType(entries, "calls_outgoing_summary")).toHaveLength(1);
    const out2 = ofType(entries, "calls_outgoing_summary")[0];
    expect(out2).toMatchObject({ count: 3, at: third.createdAt, latest: { id: third.id } });
    // It now sits after the comment: its place is its latest call.
    expect(entries.map((e) => e.type)).toEqual(["calls_incoming_summary", "comment", "calls_outgoing_summary"]);
    // The feed counts the card once, however many calls.
    expect((await who.devon.get(`/cases/${id}/feed`)).body.count).toBe(3);
  });

  it("the call card is derived from the call log (count = phone calls in that direction)", async () => {
    const id = await newCase(who.devon);
    for (let i = 0; i < 5; i++) await log(who.devon, id, "inbound");
    const card = ofType(await feed(who.devon, id), "calls_incoming_summary")[0];
    const real = store.caseInteractions.filter((x) => x.caseId === id && x.channel === "phone" && x.direction === "inbound");
    expect(card.count).toBe(real.length);
    expect(card.previous).toHaveLength(3); // latest + 3 previous shown; the rest are in the call log
  });

  it("emails, SMS and meetings are individual compact entries, not call cards", async () => {
    const id = await newCase(who.devon);
    await log(who.devon, id, "outbound", "email", "Sent the invoice");
    await log(who.devon, id, "inbound", "meeting", "Kick-off");
    const entries = await feed(who.devon, id);
    expect(entries.map((e) => [e.type, e.channel])).toEqual([["contact_logged", "email"], ["contact_logged", "meeting"]]);
  });
});

describe("mentions and access", () => {
  it("human comments still create mentions; system activity never does", async () => {
    const id = await newCase(who.devon);
    const before = store.mentions.length;
    await who.devon.post(`/cases/${id}/escalations`, { reason: "other", note: "@Sara Mitchell please look" });
    await who.devon.post("/tasks", { caseId: id, title: "Ask @Sara Mitchell" });
    await who.devon.post("/documents", { caseId: id, filename: "@Sara Mitchell.pdf", fileUrl: "https://example.com/x.pdf" });
    await log2(id);
    expect(store.mentions.length).toBe(before);
    const res = await who.devon.post(`/cases/${id}/thread`, { body: "Thanks @Sara Mitchell" });
    expect(res.body.mentioned).toEqual(["Sara Mitchell"]);
    expect(store.mentions.length).toBe(before + 1);
  });
  async function log2(id: number) {
    await who.devon.post(`/cases/${id}/contacts`, { direction: "outbound", channel: "phone", summary: "@Sara Mitchell", contact: "Client" });
  }

  it("Business Advisors, HR and signed-out callers get no Case feed", async () => {
    const id = await newCase(who.devon);
    await who.devon.patch(`/cases/${id}`, { category: "compliance" });
    for (const api of [who.leo, who.tessa]) {
      const res = await api.get(`/cases/${id}/feed`);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toMatch(/category_change|compliance/);
    }
    expect((await request(app).get(`/api/cases/${id}/feed`)).status).toBe(401);
    expect((await who.devon.get("/cases/999999/feed")).status).toBe(404);
  });

  it("there is no way to edit or delete a system entry", async () => {
    const id = await newCase(who.devon);
    await who.devon.patch(`/cases/${id}`, { priority: "high" });
    const [entry] = await feed(who.devon, id);
    for (const method of ["patch", "put", "delete"] as const) {
      const res = await request(app)[method](`/api/cases/${id}/feed`).set(await loginAs("iris@example.com")).send({});
      expect(res.status).toBe(404);
    }
    expect((await feed(who.devon, id))[0]).toEqual(entry);
  });
});
