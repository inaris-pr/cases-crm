import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

describe("GET /api/leads", () => {
  it("lists the seeded leads", async () => {
    const { body } = await request(app).get("/api/leads").expect(200);
    expect(body).toHaveLength(8);
    expect(body[0]).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      status: expect.any(String),
      source: expect.any(String),
      ownerName: expect.any(String),
    });
  });

  it("filters by status", async () => {
    const { body } = await request(app)
      .get("/api/leads")
      .query({ status: "new" })
      .expect(200);

    expect(body.length).toBeGreaterThan(0);
    expect(body.every((l: any) => l.status === "new")).toBe(true);
  });

  it("filters by owner", async () => {
    const { body } = await request(app)
      .get("/api/leads")
      .query({ owner: "Devon Park" })
      .expect(200);

    expect(body.every((l: any) => l.ownerName === "Devon Park")).toBe(true);
  });
});

describe("lead lifecycle", () => {
  it("creates, edits and deletes a lead", async () => {
    const created = await request(app)
      .post("/api/leads")
      .set(asMe)
      .send({
        firstName: "Test",
        lastName: "Prospect",
        email: "test@prospect.example",
        companyName: "Prospect Co LLC",
        intendedState: "WY",
        source: "referral",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      firstName: "Test",
      status: "new",
      source: "referral",
      ownerName: ME,
      convertedAt: null,
    });

    const patched = await request(app)
      .patch(`/api/leads/${created.body.id}`)
      .set(asMe)
      .send({ status: "working", estimatedValue: 2500 })
      .expect(200);

    expect(patched.body).toMatchObject({ status: "working", estimatedValue: 2500 });
    expect(patched.body.updatedAt).not.toBe(created.body.updatedAt);

    await request(app).delete(`/api/leads/${created.body.id}`).expect(204);
    await request(app).patch(`/api/leads/${created.body.id}`).send({ status: "new" }).expect(404);
  });

  it("rejects an unparseable payload with 400", async () => {
    const { body } = await request(app)
      .post("/api/leads")
      .set(asMe)
      .send({ firstName: "" })
      .expect(400);

    expect(body.error).toBe("validation_error");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
