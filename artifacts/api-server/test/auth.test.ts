import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers/app";

const app = createTestApp();

describe("POST /api/auth/login", () => {
  it("accepts a seeded user and returns their record", async () => {
    const { body } = await request(app)
      .post("/api/auth/login")
      .send({ email: "iris@example.com", password: "test123" })
      .expect(200);

    // Phase 1: the single legacy `role: "admin"` became `roles: ["system_owner"]`.
    expect(body).toMatchObject({
      name: "Iris Burgos",
      email: "iris@example.com",
      roles: ["system_owner"],
    });
  });

  it("never returns the password", async () => {
    const { body } = await request(app)
      .post("/api/auth/login")
      .send({ email: "devon@example.com", password: "test123" })
      .expect(200);

    expect(body).not.toHaveProperty("password");
  });

  it("matches the email case-insensitively", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: "IRIS@Example.com", password: "test123" })
      .expect(200);
  });

  it("rejects a wrong password with 401", async () => {
    const { body } = await request(app)
      .post("/api/auth/login")
      .send({ email: "iris@example.com", password: "wrong" })
      .expect(401);

    expect(body.error).toBe("invalid_credentials");
  });

  it("rejects an unknown email with 401", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "test123" })
      .expect(401);
  });
});

describe("GET /healthz", () => {
  it("reports ok", async () => {
    const { body } = await request(app).get("/healthz").expect(200);
    expect(body.status).toBe("ok");
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });
});
