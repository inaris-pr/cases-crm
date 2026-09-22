import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers/app";

const app = createTestApp();

describe("GET /api/stats — dashboard and insights", () => {
  it("returns the headline counters over the seeded data", async () => {
    const { body } = await request(app).get("/api/stats").expect(200);

    expect(body.totalCases).toBe(15);
    expect(body.completedCases).toBe(1);
    expect(body.totalCustomers).toBe(17); // counts accounts, legacy key name
    expect(body.openTasks).toBeGreaterThan(0);
  });

  it("returns a 30-day trend series", async () => {
    const { body } = await request(app).get("/api/stats").expect(200);

    expect(body.trend30).toHaveLength(30);
    for (const day of body.trend30) {
      expect(day).toEqual({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        cases: expect.any(Number),
        tasks: expect.any(Number),
      });
    }
  });

  it("breaks cases down across all five statuses", async () => {
    const { body } = await request(app).get("/api/stats").expect(200);

    expect(body.statusBreakdown.map((s: any) => s.status)).toEqual([
      "intake",
      "review",
      "in_progress",
      "waiting",
      "completed",
    ]);
    const total = body.statusBreakdown.reduce((n: number, s: any) => n + s.count, 0);
    expect(total).toBe(body.totalCases);
  });

  it("scopes to one assignee", async () => {
    const all = await request(app).get("/api/stats").expect(200);
    const devon = await request(app)
      .get("/api/stats")
      .query({ assignee: "Devon Park" })
      .expect(200);

    expect(devon.body.totalCases).toBeGreaterThan(0);
    expect(devon.body.totalCases).toBeLessThan(all.body.totalCases);
  });
});

describe("GET /api/team", () => {
  it("lists the mentionable teammates", async () => {
    const { body } = await request(app).get("/api/team").expect(200);
    expect(body).toEqual(["Iris Burgos", "Devon Park", "Sara Mitchell"]);
  });
});
