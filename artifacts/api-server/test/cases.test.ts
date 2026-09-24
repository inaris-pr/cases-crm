import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

describe("GET /api/cases — the list, cards and board views", () => {
  it("lists every seeded case with its relations", async () => {
    const { body } = await request(app).get("/api/cases").expect(200);

    expect(body).toHaveLength(15);
    expect(body[0]).toMatchObject({
      caseNumber: expect.stringMatching(/^CASE-\d{3}$/),
      title: expect.any(String),
      accountId: expect.any(Number),
      status: expect.any(String),
      priority: expect.any(String),
      account: expect.objectContaining({ name: expect.any(String) }),
    });
  });

  it("carries the legacy customer projection the board still reads", async () => {
    const { body } = await request(app).get("/api/cases").expect(200);

    // Deliberate: the Customer -> Account migration is unfinished and the
    // Kanban board plus the New Case drawer still depend on these.
    expect(body[0]).toHaveProperty("customerId");
    expect(body[0]).toHaveProperty("customer");
    expect(body[0].customerId).toBe(body[0].accountId);
  });

  it("filters by status", async () => {
    const { body } = await request(app).get("/api/cases").query({ status: "in_progress" }).expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((c: any) => c.status === "in_progress")).toBe(true);
  });

  it("filters by priority", async () => {
    const { body } = await request(app).get("/api/cases").query({ priority: "high" }).expect(200);
    expect(body.every((c: any) => c.priority === "high")).toBe(true);
  });

  it("filters by assignee", async () => {
    const { body } = await request(app).get("/api/cases").query({ assignee: "Devon Park" }).expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((c: any) => c.ownerName === "Devon Park")).toBe(true);
  });

  it("searches case text", async () => {
    const { body } = await request(app).get("/api/cases").query({ search: "Delaware" }).expect(200);
    expect(body.length).toBeGreaterThan(0);
  });

  it("combines filters", async () => {
    const { body } = await request(app)
      .get("/api/cases")
      .query({ status: "in_progress", assignee: "Iris Burgos" })
      .expect(200);

    expect(
      body.every((c: any) => c.status === "in_progress" && c.ownerName === "Iris Burgos"),
    ).toBe(true);
  });

  it("returns an empty array rather than erroring when nothing matches", async () => {
    const { body } = await request(app)
      .get("/api/cases")
      .query({ search: "zzzzz-no-such-case" })
      .expect(200);

    expect(body).toEqual([]);
  });
});

describe("GET /api/cases/:id — case detail", () => {
  it("returns the case with tasks and documents embedded", async () => {
    const { body } = await request(app).get("/api/cases/1").expect(200);

    expect(body.caseNumber).toBe("CASE-001");
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.account).toBeTruthy();
  });

  it("404s on an unknown case", async () => {
    const { body } = await request(app).get("/api/cases/99999").expect(404);
    expect(body.error).toBe("not_found");
  });
});

describe("case writes", () => {
  it("creates a case with a generated case number", async () => {
    const { body } = await request(app)
      .post("/api/cases")
      .set(asMe)
      .send({
        accountId: 1,
        title: "Annual report filing",
        priority: "medium",
        description: "FY filing",
        tags: ["annual-report"],
      })
      .expect(201);

    expect(body).toMatchObject({
      title: "Annual report filing",
      accountId: 1,
      status: "intake",
      ownerName: ME,
      tags: ["annual-report"],
    });
    expect(body.caseNumber).toMatch(/^CASE-\d{3}$/);
  });

  it("patches status and priority", async () => {
    const before = (await request(app).get("/api/cases/1").expect(200)).body;

    const { body } = await request(app)
      .patch("/api/cases/1")
      .set(asMe)
      .send({ status: "completed", priority: "critical" })
      .expect(200);

    expect(body).toMatchObject({ status: "completed", priority: "critical" });
    expect(body.updatedAt).not.toBe(before.updatedAt);
  });

  it("rejects an invalid status with 400", async () => {
    const { body } = await request(app)
      .patch("/api/cases/1")
      .set(asMe)
      .send({ status: "not_a_status" })
      .expect(400);

    expect(body.error).toBe("validation_error");
  });

  it("rejects a case with no title with 400", async () => {
    await request(app).post("/api/cases").set(asMe).send({ accountId: 1, title: "" }).expect(400);
  });
});
