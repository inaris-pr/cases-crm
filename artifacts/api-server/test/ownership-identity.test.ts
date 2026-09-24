import { describe, it, expect } from "vitest";
import { store } from "../src/store";
import { createTestApp, loginAs } from "./helpers/app";
import { apiAs } from "./helpers/api";

/**
 * RBAC Phase 4 — ownership and authorship are stable employee ids.
 * Renaming an employee changes no ownership, authorship or access; display
 * names sent by clients never identify anyone; historical names stay as
 * they were written.
 */
const app = createTestApp();
const iris = apiAs(app, loginAs("iris@example.com"));
const devon = apiAs(app, loginAs("devon@example.com"));
const sara = apiAs(app, loginAs("sara@example.com"));
const nadia = apiAs(app, loginAs("nadia@example.com"));

const user = (email: string) => store.users.find((u) => u.email === email)!;
const DEVON = () => user("devon@example.com");
const SARA = () => user("sara@example.com");

describe("spoofed display names are ignored", () => {
  it("authors, callers and senders come from the session", async () => {
    const c = store.cases.find((x) => x.ownerUserId === DEVON().id)!;
    const note = (await devon.post(`/cases/${c.id}/thread`, { body: "mine", authorName: "Iris Burgos" })).body;
    expect(note).toMatchObject({ authorName: "Devon Park", authorUserId: DEVON().id });
    const call = (await devon.post(`/cases/${c.id}/contacts`, {
      direction: "inbound", channel: "phone", summary: "s", contact: "x", byName: "Iris Burgos",
    })).body;
    expect(call).toMatchObject({ byName: "Devon Park", byUserId: DEVON().id });
    const convo = (await devon.post("/conversations", { type: "dm", members: ["Devon Park", "Sara Mitchell"] })).body;
    expect(convo.memberUserIds).toEqual([DEVON().id, SARA().id]);
    const msg = (await devon.post(`/conversations/${convo.id}/messages`, { content: "hi", senderName: "Sara Mitchell" })).body;
    expect(msg).toMatchObject({ senderName: "Devon Park", senderUserId: DEVON().id });
    // Sara, named in the spoofed field, cannot delete Devon's message.
    expect((await sara.del(`/messages/${msg.id}`)).body.error).toBe("not_author");
  });

  it("an owner name in a create or update body never sets the owner", async () => {
    const lead = (await iris.post("/leads", { firstName: "A", lastName: "B", ownerName: "Devon Park" })).body;
    expect(lead.ownerUserId).toBe(user("iris@example.com").id);
    const caseRes = (await devon.post("/cases", { title: "t", accountId: 1, ownerName: "Iris Burgos" })).body;
    expect(caseRes.ownerUserId).toBe(DEVON().id);
    expect((await iris.patch(`/leads/${lead.id}`, { ownerName: "Devon Park" })).body.error).toBe("owner_change_requires_reassign");
  });

  it("a conversation member name must be exactly one active employee", async () => {
    expect((await devon.post("/conversations", { type: "dm", members: ["Devon Park", "Nobody"] })).body)
      .toEqual({ error: "unknown_member", members: ["Nobody"] });
    expect((await devon.post("/conversations", { type: "dm", memberUserIds: [DEVON().id, 99999] })).body)
      .toEqual({ error: "unknown_member", memberUserIds: [99999] });
  });
});

describe("renaming an employee", () => {
  it("keeps ownership, authorship, team access and isolation — and history text", async () => {
    const devonsCase = store.cases.find((x) => x.ownerUserId === DEVON().id)!;
    const saraCase = store.cases.find((x) => x.ownerUserId === SARA().id)!;
    const oldNote = (await devon.post(`/cases/${devonsCase.id}/thread`, { body: "before rename" })).body;
    await iris.post(`/cases/${devonsCase.id}/thread`, { body: "@Devon Park heads up" });
    const convo = (await devon.post("/conversations", { type: "group", name: "Rename", members: ["Devon Park", "Sara Mitchell"] })).body;
    const oldMsg = (await devon.post(`/conversations/${convo.id}/messages`, { content: "before" })).body;
    const devonsOwned = store.cases.filter((c) => c.ownerUserId === DEVON().id).map((c) => c.id);

    const original = { devon: DEVON().name, sara: SARA().name };
    try {
      DEVON().name = "Devon Parker";
      // Someone else now carries Devon's OLD name.
      SARA().name = "Devon Park";

      // Ownership did not move, by id.
      expect(store.cases.filter((c) => c.ownerUserId === DEVON().id).map((c) => c.id)).toEqual(devonsOwned);
      // Devon still edits his own case; the new "Devon Park" does not.
      expect((await devon.patch(`/cases/${devonsCase.id}`, { priority: "high" })).status).toBe(200);
      expect((await sara.patch(`/cases/${devonsCase.id}`, { priority: "low" })).body.error).toBe("out_of_scope");
      // …and Devon gains nothing over Sara's records.
      expect((await devon.patch(`/cases/${saraCase.id}`, { priority: "low" })).body.error).toBe("out_of_scope");
      // Team access follows ids.
      expect((await nadia.patch(`/cases/${devonsCase.id}`, { priority: "medium" })).status).toBe(200);
      // The old name no longer reaches Devon's metrics; the new one does.
      expect((await iris.get(`/stats?assignee=${encodeURIComponent("Devon Parker")}`)).body.totalCases).toBe(devonsOwned.length);

      // Authorship stays with Devon's id; the historical text is untouched.
      const thread = (await devon.get(`/cases/${devonsCase.id}/thread`)).body as any[];
      const kept = thread.find((t) => t.id === oldNote.id);
      expect(kept).toMatchObject({ authorName: "Devon Park", authorUserId: DEVON().id });
      const fresh = (await devon.post(`/cases/${devonsCase.id}/thread`, { body: "after rename" })).body;
      expect(fresh).toMatchObject({ authorName: "Devon Parker", authorUserId: DEVON().id });

      // Mentions and messages follow ids: Devon still reads his inbox and
      // his conversation; Sara (now named "Devon Park") gets neither.
      expect((await devon.get("/mentions")).body.some((m: any) => m.body === "@Devon Park heads up")).toBe(true);
      expect((await sara.get("/mentions")).body.some((m: any) => m.body === "@Devon Park heads up")).toBe(false);
      const msgs = (await devon.get(`/conversations/${convo.id}/messages`)).body as any[];
      expect(msgs.find((m) => m.id === oldMsg.id)).toMatchObject({ senderName: "Devon Park" });
      expect((await sara.del(`/messages/${oldMsg.id}`)).body.error).toBe("not_author");
      const list = (await devon.get("/conversations")).body as any[];
      expect(list.find((c) => c.id === convo.id).members).toEqual(["Devon Parker", "Devon Park"]);
    } finally {
      DEVON().name = original.devon;
      SARA().name = original.sara;
    }
  });
});

describe("@mentions resolve to employees who may view the case", () => {
  it("notifies by id and skips people without access to the case", async () => {
    const c = store.cases.find((x) => x.ownerUserId === DEVON().id)!;
    const res = (await iris.post(`/cases/${c.id}/thread`, { body: "@Sara and @Leo Martinez and @Tessa please look" })).body;
    expect(res.mentioned).toEqual(["Sara Mitchell"]); // Leo and Tessa cannot view cases
    const m = store.mentions.find((x) => x.threadEntryId === res.id)!;
    expect(m).toMatchObject({ toUserId: SARA().id, fromUserId: user("iris@example.com").id });
  });
});
