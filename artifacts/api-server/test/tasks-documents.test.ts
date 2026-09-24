import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, asMe } from "./helpers/app";

const app = createTestApp();

describe("tasks", () => {
  it("lists the seeded tasks", async () => {
    const { body } = await request(app).get("/api/tasks").expect(200);
    expect(body).toHaveLength(65);
  });

  it("filters to one case", async () => {
    const { body } = await request(app).get("/api/tasks").query({ caseId: 1 }).expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((t: any) => t.caseId === 1)).toBe(true);
  });

  it("creates a task and moves it through its statuses", async () => {
    const created = (
      await request(app)
        .post("/api/tasks")
        .set(asMe)
        .send({ caseId: 1, title: "Order certified copies" })
        .expect(201)
    ).body;

    expect(created).toMatchObject({ caseId: 1, title: "Order certified copies", status: "pending" });
    expect(created.dueDate).toBeNull();

    const started = await request(app)
      .patch(`/api/tasks/${created.id}`)
      .set(asMe)
      .send({ status: "in_progress" })
      .expect(200);
    expect(started.body.status).toBe("in_progress");

    const done = await request(app)
      .patch(`/api/tasks/${created.id}`)
      .set(asMe)
      .send({ status: "completed" })
      .expect(200);
    expect(done.body.status).toBe("completed");
  });

  it("accepts an ISO due date", async () => {
    const due = new Date(Date.now() + 7 * 864e5).toISOString();
    const { body } = await request(app)
      .post("/api/tasks")
      .set(asMe)
      .send({ caseId: 1, title: "File annual report", dueDate: due })
      .expect(201);

    expect(body.dueDate).toBe(due);
  });

  it("rejects a non-ISO due date with 400", async () => {
    // The frontend sends `undefined` when the field is blank, never null.
    await request(app)
      .post("/api/tasks")
      .set(asMe)
      .send({ caseId: 1, title: "Bad date", dueDate: "next tuesday" })
      .expect(400);
  });

  it("404s when the case does not exist", async () => {
    const { body } = await request(app)
      .post("/api/tasks")
      .set(asMe)
      .send({ caseId: 99999, title: "Orphan" })
      .expect(404);

    expect(body.error).toBe("case_not_found");
  });

  it("surfaces new tasks in the case detail payload", async () => {
    const before = (await request(app).get("/api/cases/2").expect(200)).body.tasks.length;
    await request(app).post("/api/tasks").set(asMe).send({ caseId: 2, title: "Extra" }).expect(201);
    const after = (await request(app).get("/api/cases/2").expect(200)).body.tasks.length;

    expect(after).toBe(before + 1);
  });
});

describe("documents", () => {
  it("lists the seeded documents", async () => {
    const { body } = await request(app).get("/api/documents").expect(200);
    expect(body).toHaveLength(12);
  });

  it("filters to one case", async () => {
    const { body } = await request(app).get("/api/documents").query({ caseId: 1 }).expect(200);
    expect(body.every((d: any) => d.caseId === 1)).toBe(true);
  });

  it("records a document reference", async () => {
    const { body } = await request(app)
      .post("/api/documents")
      .set(asMe)
      .send({
        caseId: 1,
        filename: "Operating-Agreement-v3.docx",
        fileUrl: "https://example.com/docs/oa-v3.docx",
        type: "contract",
        size: 42_000,
        tags: ["operating-agreement"],
      })
      .expect(201);

    expect(body).toMatchObject({
      caseId: 1,
      filename: "Operating-Agreement-v3.docx",
      type: "contract",
      tags: ["operating-agreement"],
    });
  });

  it("rejects an unknown document type with 400", async () => {
    await request(app)
      .post("/api/documents")
      .set(asMe)
      .send({ caseId: 1, filename: "x.pdf", fileUrl: "https://example.com/x.pdf", type: "spreadsheet", size: 1 })
      .expect(400);
  });
});
