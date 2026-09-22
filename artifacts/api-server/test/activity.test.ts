import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

/**
 * The case activity surfaces: logged interactions (calls, emails, meetings)
 * and the internal comment thread, plus the @mention inbox the thread feeds.
 *
 * Note the identity convention: the X-User header is sent on every request,
 * but these routes additionally require the author's name in the body
 * (byName / authorName). Both are load-bearing — see CLAUDE.md.
 */
describe("case interactions", () => {
  it("lists the interactions seeded against a case", async () => {
    const { body } = await request(app).get("/api/cases/1/contacts").expect(200);

    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      caseId: 1,
      direction: expect.stringMatching(/^(inbound|outbound)$/),
      channel: expect.any(String),
      summary: expect.any(String),
      contact: expect.any(String),
      byName: expect.any(String),
    });
  });

  it("logs an outbound call", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/contacts")
      .set(asMe)
      .send({
        direction: "outbound",
        channel: "phone",
        summary: "Walked through the DE filing timeline",
        contact: "Amelia Reyes",
        byName: ME,
      })
      .expect(201);

    expect(body).toMatchObject({ caseId: 1, channel: "phone", byName: ME });
  });

  it("logs an inbound email", async () => {
    await request(app)
      .post("/api/cases/1/contacts")
      .set(asMe)
      .send({ direction: "inbound", channel: "email", summary: "Client sent the signed OA", contact: "Amelia Reyes", byName: ME })
      .expect(201);
  });

  it("requires the author name in the body", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/contacts")
      .set(asMe)
      .send({ direction: "outbound", channel: "phone", summary: "No author", contact: "Amelia Reyes" })
      .expect(400);

    expect(body.error).toBe("validation_error");
  });

  it("rejects an unknown channel", async () => {
    await request(app)
      .post("/api/cases/1/contacts")
      .set(asMe)
      .send({ direction: "outbound", channel: "carrier-pigeon", summary: "x", contact: "y", byName: ME })
      .expect(400);
  });

  it("404s on an unknown case", async () => {
    await request(app)
      .post("/api/cases/99999/contacts")
      .set(asMe)
      .send({ direction: "outbound", channel: "phone", summary: "x", contact: "y", byName: ME })
      .expect(404);
  });
});

describe("case thread", () => {
  it("lists seeded thread entries oldest first", async () => {
    const { body } = await request(app).get("/api/cases/1/thread").expect(200);

    expect(body.length).toBeGreaterThan(0);
    const times = body.map((e: any) => +new Date(e.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("posts a comment", async () => {
    const { body } = await request(app)
      .post("/api/cases/1/thread")
      .set(asMe)
      .send({ authorName: ME, body: "Filing confirmation received from the state." })
      .expect(201);

    expect(body).toMatchObject({ caseId: 1, authorName: ME });
  });

  it("requires a non-empty body", async () => {
    await request(app)
      .post("/api/cases/1/thread")
      .set(asMe)
      .send({ authorName: ME, body: "" })
      .expect(400);
  });
});

describe("@mentions", () => {
  it("creates an inbox entry for the mentioned teammate", async () => {
    await request(app)
      .post("/api/cases/1/thread")
      .set(asMe)
      .send({ authorName: ME, body: "@Devon Park can you confirm the registered agent?" })
      .expect(201);

    const { body } = await request(app)
      .get("/api/mentions")
      .query({ for: "Devon Park" })
      .expect(200);

    const mine = body.find((m: any) => m.body.includes("registered agent"));
    expect(mine).toBeTruthy();
    expect(mine).toMatchObject({ fromName: ME, toName: "Devon Park", caseId: 1, readAt: null });
  });

  it("matches a first-name mention too", async () => {
    await request(app)
      .post("/api/cases/2/thread")
      .set(asMe)
      .send({ authorName: ME, body: "@Sara please pick this up" })
      .expect(201);

    const { body } = await request(app).get("/api/mentions").query({ for: "Sara Mitchell" }).expect(200);
    expect(body.some((m: any) => m.body.includes("pick this up"))).toBe(true);
  });

  it("does not notify the author of their own mention", async () => {
    await request(app)
      .post("/api/cases/3/thread")
      .set(asMe)
      .send({ authorName: ME, body: `@${ME} note to self` })
      .expect(201);

    const { body } = await request(app).get("/api/mentions").query({ for: ME }).expect(200);
    expect(body.some((m: any) => m.body.includes("note to self"))).toBe(false);
  });

  it("carries the case number and title for the inbox row", async () => {
    await request(app)
      .post("/api/cases/1/thread")
      .set(asMe)
      .send({ authorName: ME, body: "@Devon Park context check" })
      .expect(201);

    const { body } = await request(app).get("/api/mentions").query({ for: "Devon Park" }).expect(200);
    expect(body[0]).toMatchObject({ caseNumber: expect.any(String), caseTitle: expect.any(String) });
  });

  it("marks a mention read", async () => {
    await request(app)
      .post("/api/cases/1/thread")
      .set(asMe)
      .send({ authorName: ME, body: "@Devon Park please read" })
      .expect(201);

    const unread = (
      await request(app).get("/api/mentions").query({ for: "Devon Park" }).expect(200)
    ).body.find((m: any) => !m.readAt);

    const { body } = await request(app).patch(`/api/mentions/${unread.id}/read`).expect(200);
    expect(Date.parse(body.readAt)).not.toBeNaN();
  });
});
