import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, ME, asMe, loginAs } from "./helpers/app";

const app = createTestApp();

describe("conversations", () => {
  it("starts empty — the seed creates no conversations", async () => {
    // store.ts seeds accounts, contacts, cases, tasks and documents but no
    // conversations: its only conversations.push() lives inside the
    // findOrCreateDm() helper, which nothing calls. Every conversation in a
    // running install was made through the UI.
    const { body } = await request(app).get("/api/conversations").expect(200);
    expect(body).toEqual([]);
  });

  it("returns a created conversation in the list", async () => {
    await request(app)
      .post("/api/conversations")
      .set(asMe)
      .send({ type: "group", name: "Renewals", members: [ME, "Devon Park"] })
      .expect(201);

    const { body } = await request(app).get("/api/conversations").expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      type: expect.stringMatching(/^(dm|group)$/),
      members: expect.any(Array),
    });
  });

  it("creates a group", async () => {
    const { body } = await request(app)
      .post("/api/conversations")
      .set(asMe)
      .send({ type: "group", name: "DE Filings", members: [ME, "Sara Mitchell"] })
      .expect(201);

    expect(body).toMatchObject({ type: "group", name: "DE Filings" });
    expect(body.members).toEqual(expect.arrayContaining([ME, "Sara Mitchell"]));
  });

  it("creates a DM", async () => {
    const { body } = await request(app)
      .post("/api/conversations")
      .set(asMe)
      .send({ type: "dm", members: [ME, "Sara Mitchell"] })
      .expect(201);

    expect(body).toMatchObject({ type: "dm", name: null });
    expect(body.members).toEqual(expect.arrayContaining([ME, "Sara Mitchell"]));
  });

  it("currently creates a SECOND DM for the same pair rather than reusing one", async () => {
    // Pinning actual behaviour, not endorsing it. store.ts exports a
    // findOrCreateDm() helper that would de-duplicate this, but POST
    // /conversations never calls it, so duplicate DMs between the same two
    // people are reachable from the UI. See CLAUDE_HANDOFF.md section 6.5.
    // If that helper is ever wired up, this test should flip to expecting
    // the same id back.
    const first = await request(app)
      .post("/api/conversations")
      .set(asMe)
      .send({ type: "dm", members: [ME, "Devon Park"] })
      .expect(201);

    const second = await request(app)
      .post("/api/conversations")
      .set(asMe)
      .send({ type: "dm", members: ["Devon Park", ME] })
      .expect(201);

    expect(second.body.id).not.toBe(first.body.id);
  });

  it("scopes the conversation list to the signed-in user", async () => {
    const { body } = await request(app).get("/api/conversations").set(asMe).expect(200);
    expect(body.every((c: any) => c.members.includes(ME))).toBe(true);
    expect(body[0]).toHaveProperty("lastMessage");
    expect(body[0]).toHaveProperty("lastMessageAt");
  });
});

describe("messages", () => {
  it("sends and reads a message", async () => {
    const convo = (await request(app).get("/api/conversations").expect(200)).body[0];

    const sent = (
      await request(app)
        .post(`/api/conversations/${convo.id}/messages`)
        .set(asMe)
        .send({ senderName: ME, content: "Filing went through." })
        .expect(201)
    ).body;

    expect(sent).toMatchObject({ senderName: ME, content: "Filing went through.", deletedAt: null });

    const { body } = await request(app).get(`/api/conversations/${convo.id}/messages`).expect(200);
    expect(body.some((m: any) => m.id === sent.id)).toBe(true);
  });

  it("tags a message with cases and resolves their numbers", async () => {
    const convo = (await request(app).get("/api/conversations").expect(200)).body[0];

    const { body } = await request(app)
      .post(`/api/conversations/${convo.id}/messages`)
      .set(asMe)
      .send({ senderName: ME, content: "See these two", caseTags: [1, 2] })
      .expect(201);

    expect(body.caseTags).toHaveLength(2);
    expect(body.caseTags[0]).toMatchObject({ id: 1, caseNumber: "CASE-001" });
  });

  it("soft-deletes the author's own message", async () => {
    const convo = (await request(app).get("/api/conversations").expect(200)).body[0];
    const sent = (
      await request(app)
        .post(`/api/conversations/${convo.id}/messages`)
        .set(asMe)
        .send({ senderName: ME, content: "to be removed" })
        .expect(201)
    ).body;

    await request(app).delete(`/api/messages/${sent.id}`).set(asMe).send({ senderName: ME }).expect(204);

    const after = (
      await request(app).get(`/api/conversations/${convo.id}/messages`).expect(200)
    ).body.find((m: any) => m.id === sent.id);

    expect(after.deletedAt).not.toBeNull();
    expect(after.content).toBe("");
  });

  it("refuses to delete someone else's message", async () => {
    const convo = (await request(app).get("/api/conversations").expect(200)).body[0];
    const sent = (
      await request(app)
        .post(`/api/conversations/${convo.id}/messages`)
        .set(asMe)
        .send({ senderName: ME, content: "mine, not yours" })
        .expect(201)
    ).body;

    // Identity comes from the session: Devon, signed in as himself, tries to
    // delete Iris's message. (Previously this sent `senderName: "Devon Park"`
    // in the body, which no longer establishes identity.)
    const asDevon = await loginAs("devon@example.com");
    const { body } = await request(app, asDevon)
      .delete(`/api/messages/${sent.id}`)
      .expect(403);

    expect(body.error).toBe("not_author");
  });

  it("404s on an unknown conversation", async () => {
    await request(app)
      .post("/api/conversations/99999/messages")
      .set(asMe)
      .send({ senderName: ME, content: "nowhere" })
      .expect(404);
  });
});
