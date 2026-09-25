import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import request from "supertest";
import { createTestApp, asMe } from "./helpers/app";
import { sessionForRole } from "./helpers/roles";
import { store } from "../src/store";
import type { RoleKey } from "../src/access";

/**
 * Phase 8 — the read-only Knowledge Base API.
 *   GET /api/knowledge/articles
 *   GET /api/knowledge/articles/:idOrSlug
 */

const app = createTestApp();
const get = (url: string, cookie: { Cookie: string } = asMe) => request(app).get(`/api${url}`).set(cookie);
const ids = (res: request.Response) => res.body.articles.map((a: { id: string }) => a.id);

describe("GET /knowledge/articles", () => {
  it("lists the five pilot articles as summaries without section text", async () => {
    const res = await get("/knowledge/articles");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(5);
    expect(ids(res)).toEqual([
      "llc-az-state-services",
      "llc-ca-state-services",
      "llc-de-state-services",
      "llc-fl-state-services",
      "llc-wy-state-services",
    ]);
    const az = res.body.articles[0];
    expect(az).toMatchObject({
      title: "Arizona — LLC Services & Requirements",
      entityType: "llc",
      jurisdictionCode: "AZ",
      status: "published",
      audience: "internal",
      internalOnly: true,
      counselReviewed: false,
      flagSummary: { openResearchItems: 1 },
    });
    expect(az.sections.map((s: { order: number }) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(az.sections[9]).toMatchObject({ key: "open_research_item_publication", flag: "open_research_item", verification: "unverified" });
    expect(az.sections[0].content).toBeUndefined();
    expect(az.matchedSectionIds).toBeUndefined();
  });

  it("filters by entity type", async () => {
    expect(ids(await get("/knowledge/articles?entityType=llc")).length).toBe(5);
    const corp = await get("/knowledge/articles?entityType=corporation");
    expect(corp.status).toBe(200);
    expect(corp.body).toEqual({ count: 0, articles: [] });
  });

  it("filters by jurisdiction, in either case", async () => {
    expect(ids(await get("/knowledge/articles?jurisdiction=CA"))).toEqual(["llc-ca-state-services"]);
    expect(ids(await get("/knowledge/articles?jurisdiction=wy"))).toEqual(["llc-wy-state-services"]);
    // A real jurisdiction with no article yet.
    expect(ids(await get("/knowledge/articles?jurisdiction=TX"))).toEqual([]);
  });

  it("filters by topic", async () => {
    expect(ids(await get("/knowledge/articles?topic=publication"))).toEqual(["llc-az-state-services"]);
    expect(ids(await get("/knowledge/articles?topic=franchise_tax"))).toEqual(["llc-ca-state-services"]);
    expect(ids(await get("/knowledge/articles?topic=late_penalty"))).toEqual(["llc-fl-state-services"]);
    expect(ids(await get("/knowledge/articles?topic=registered_agent")).length).toBe(5);
  });

  it("filters by source flag and status", async () => {
    expect(ids(await get("/knowledge/articles?flag=open_research_item"))).toEqual(["llc-az-state-services"]);
    expect(ids(await get("/knowledge/articles?flag=client_disclosure"))).toEqual(["llc-ca-state-services", "llc-fl-state-services"]);
    expect(ids(await get("/knowledge/articles?flag=known_service_gap"))).toEqual([]);
    expect(ids(await get("/knowledge/articles?status=published")).length).toBe(5);
    // Readers only ever see published articles.
    expect(ids(await get("/knowledge/articles?status=draft"))).toEqual([]);
  });

  it("combines filters", async () => {
    expect(ids(await get("/knowledge/articles?entityType=llc&jurisdiction=DE&topic=annual_tax"))).toEqual(["llc-de-state-services"]);
    expect(ids(await get("/knowledge/articles?jurisdiction=DE&topic=publication"))).toEqual([]);
  });

  it("a simple word search returns the matching sections", async () => {
    const res = await get("/knowledge/articles?q=Franchise%20Tax%20Board");
    expect(ids(res)).toEqual(["llc-ca-state-services"]);
    expect(res.body.articles[0].matchedSectionIds).toEqual(["llc-ca-state-services:franchise_tax"]);
    const puppeteer = await get("/knowledge/articles?q=puppeteer");
    expect(ids(puppeteer)).toEqual(["llc-fl-state-services", "llc-wy-state-services"]);
    expect(puppeteer.body.articles[0].matchedSectionIds).toEqual(["llc-fl-state-services:formation_filing"]);
    expect(ids(await get("/knowledge/articles?q=trademark"))).toEqual([]);
  });

  it("rejects unknown filter values and unknown parameters", async () => {
    for (const q of ["entityType=partnership", "jurisdiction=XX", "status=approved", "topic=astrology", "flag=warning", "state=CA"]) {
      const res = await get(`/knowledge/articles?${q}`);
      expect(`${q} → ${res.status} ${res.body.error}`).toBe(`${q} → 400 validation_error`);
    }
  });
});

describe("GET /knowledge/articles/:idOrSlug", () => {
  it("returns one article by id with ordered sections, citations and its source", async () => {
    const res = await get("/knowledge/articles/llc-az-state-services");
    expect(res.status).toBe(200);
    expect(res.body.sections.map((s: { key: string }) => s.key)).toEqual([
      "formation_filing",
      "registered_agent",
      "annual_report_and_renewal_filing",
      "amendments_and_sos_filings",
      "certificates_and_certified_copies",
      "ein_and_tax_elections",
      "formation_documents_included",
      "additional_services_available",
      "state_specific_requirements",
      "open_research_item_publication",
    ]);
    const ori = res.body.sections[9];
    expect(ori).toMatchObject({
      id: "llc-az-state-services:open_research_item_publication",
      label: "Open Research Item — Publication",
      flag: "open_research_item",
      verification: "unverified",
      citation: "Arizona — LLC Services & Requirements → Open Research Item — Publication",
      sourcePages: [10],
    });
    expect(ori.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.source).toMatchObject({
      fileName: "LLC-Formation-Services-by-State.pdf",
      internalOnly: true,
      counselReviewed: false,
    });
  });

  it("the same article by its slug", async () => {
    const bySlug = await get("/knowledge/articles/wyoming-llc-services-and-requirements");
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.id).toBe("llc-wy-state-services");
    expect(bySlug.body.serviceProfile.formationFulfillment.value).toBe("automated_in_house");
  });

  it("an unknown article is a 404", async () => {
    for (const key of ["llc-tx-state-services", "corporation-ca-state-services", "nope"]) {
      const res = await get(`/knowledge/articles/${key}`);
      expect(`${key} ${res.status}`).toBe(`${key} 404`);
      expect(res.body).toEqual({ error: "not_found" });
    }
  });
});

describe("access", () => {
  it("is refused without a session", async () => {
    expect((await request(app).get("/api/knowledge/articles")).status).toBe(401);
    expect((await request(app).get("/api/knowledge/articles/llc-ca-state-services")).status).toBe(401);
  });

  it("every operational role may read; the reserved Filing role may not", async () => {
    const roles: RoleKey[] = [
      "csr", "csr_supervisor", "business_advisor", "business_advisor_supervisor",
      "operations_admin", "operations_admin_supervisor", "hr", "system_owner",
    ];
    for (const role of roles) {
      const cookie = await sessionForRole(role);
      expect(`${role} ${(await get("/knowledge/articles", cookie)).status}`).toBe(`${role} 200`);
      expect(`${role} ${(await get("/knowledge/articles/llc-ca-state-services", cookie)).status}`).toBe(`${role} 200`);
    }
    const filing = await sessionForRole("filing");
    for (const url of ["/knowledge/articles", "/knowledge/articles/llc-ca-state-services"]) {
      const res = await get(url, filing);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "forbidden", permission: "knowledge.view" });
    }
  });
});

describe("data safety", () => {
  it("the Knowledge Base is not part of the persisted store", async () => {
    await get("/knowledge/articles");
    await get("/knowledge/articles/llc-ca-state-services");
    expect(Object.keys(store).filter((k) => /knowledge/i.test(k))).toEqual([]);
    expect(Object.keys(store.seq).filter((k) => /knowledge/i.test(k))).toEqual([]);
  });

  it("reading articles writes nothing to the (test) store file", async () => {
    const file = path.join(process.cwd(), "data", "store.json");
    await new Promise((r) => setTimeout(r, 250)); // let any pending save from earlier tests land
    const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
    for (let i = 0; i < 3; i++) await get("/knowledge/articles?q=registered%20agent");
    await new Promise((r) => setTimeout(r, 250));
    const after = fs.existsSync(file) ? fs.readFileSync(file) : null;
    expect(after === null ? before === null : before !== null && after.equals(before)).toBe(true);
  });
});
