import { describe, it, expect } from "vitest";
import request from "supertest";
import {
  KNOWLEDGE_TOPICS,
  SERVICE_AVAILABILITY_STATUSES,
  SERVICE_CATALOG,
  SOURCE_FLAGS,
  KNOWLEDGE_ENTITY_TYPES,
} from "../src/knowledge/model";
import {
  KNOWLEDGE_ENTITY_TYPE_LABELS,
  SERVICE_AVAILABILITY_STATUSES as WEB_STATUSES,
  SERVICE_LABELS,
  SOURCE_FLAGS as WEB_FLAGS,
  TOPIC_LABELS,
  availabilityPresentation,
  disputedRows,
  evidenceLabel,
  explainMatch,
  filterOptions,
  formatSourceDate,
  highlightedOutline,
  knowledgeSearchParams,
  sectionPresentation,
  sharedServiceRows,
  unavailableRows,
  type KnowledgeArticleDetail,
  type KnowledgeArticleSummary,
} from "../../cases/src/lib/knowledge";
import { createTestApp, asMe } from "./helpers/app";

/**
 * Phase 8B — the Knowledge Base UI's pure presentation rules
 * (artifacts/cases/src/lib/knowledge.ts), exercised on real API responses.
 */

const app = createTestApp();
const get = async <T>(url: string): Promise<T> => (await request(app).get(`/api${url}`).set(asMe)).body as T;
const list = (q = "") => get<{ articles: KnowledgeArticleSummary[] }>(`/knowledge/articles${q}`).then((b) => b.articles);
const detail = (id: string) => get<KnowledgeArticleDetail>(`/knowledge/articles/${id}`);

describe("the web vocabularies agree with the API", () => {
  it("topics, services, flags, statuses and entity types", () => {
    expect(Object.keys(TOPIC_LABELS).sort()).toEqual([...KNOWLEDGE_TOPICS].sort());
    expect(SERVICE_LABELS).toEqual(Object.fromEntries(Object.entries(SERVICE_CATALOG).map(([k, v]) => [k, v.label])));
    expect([...WEB_FLAGS]).toEqual([...SOURCE_FLAGS]);
    expect([...WEB_STATUSES]).toEqual([...SERVICE_AVAILABILITY_STATUSES]);
    expect(Object.keys(KNOWLEDGE_ENTITY_TYPE_LABELS).sort()).toEqual([...KNOWLEDGE_ENTITY_TYPES].sort());
  });
});

describe("section presentation", () => {
  const base = { clientDisclosure: null, notApplicable: false, verification: "documented" } as const;

  it("an Open Research Item always reads as unresolved", () => {
    const p = sectionPresentation({ ...base, flag: "open_research_item", verification: "unverified" });
    expect(p).toMatchObject({ badge: "Open research item · Unresolved", tone: "unresolved", unresolved: true });
    expect(p.note).toMatch(/unanswered question, not a settled fact/);
    // Unverified content is unresolved whatever its flag.
    expect(sectionPresentation({ ...base, flag: "none", verification: "unverified" }).unresolved).toBe(true);
  });

  it("client disclosures keep required vs recommended", () => {
    expect(sectionPresentation({ ...base, flag: "client_disclosure", clientDisclosure: "required" }).badge).toBe("Client disclosure · Required");
    expect(sectionPresentation({ ...base, flag: "client_disclosure", clientDisclosure: "recommended" }).badge).toBe("Client disclosure · Recommended");
  });

  it("service gaps, state requirements, N/A and ordinary sections", () => {
    expect(sectionPresentation({ ...base, flag: "known_service_gap" })).toMatchObject({ badge: "Known service gap", tone: "warning" });
    expect(sectionPresentation({ ...base, flag: "state_requirement" })).toMatchObject({ badge: "State requirement", tone: "info" });
    expect(sectionPresentation({ ...base, flag: "source_discrepancy" }).unresolved).toBe(true);
    expect(sectionPresentation({ ...base, flag: "none", notApplicable: true }).badge).toBe("N/A");
    expect(sectionPresentation({ ...base, flag: "none" })).toMatchObject({ badge: null, tone: "neutral", unresolved: false });
  });
});

describe("availability wording", () => {
  it("only direct and inherited assert availability; unknown is never 'no'", () => {
    const confirmed = WEB_STATUSES.filter((s) => availabilityPresentation(s).confirmedAvailable);
    expect(confirmed).toEqual(["direct", "inherited"]);
    expect(availabilityPresentation("unknown").label).toBe("No confirmed information in the current Knowledge Base");
    expect(availabilityPresentation("disputed").label).toBe("Source discrepancy — not confirmed");
    expect(availabilityPresentation("direct", "Florida").label).toBe("Stated in the Florida entry");
    expect(availabilityPresentation("inherited").label).toBe("Applies from a national source statement");
    for (const s of WEB_STATUSES) expect(availabilityPresentation(s).label).not.toMatch(/^(No|Not available)$/);
  });
});

describe("reader panels from real articles", () => {
  it("Florida: inherited national services are listed with the national evidence, not as entry text", async () => {
    const fl = await detail("llc-fl-state-services");
    const rows = sharedServiceRows(fl);
    const bank = rows.find((r) => r.serviceKey === "instant_bank_account")!;
    expect(bank).toMatchObject({ status: "inherited", directlyMentioned: false, directSectionKeys: [], nationalEvidence: true });
    expect(bank.evidence.map((e) => evidenceLabel(e, fl.id, bank.nationalEvidence))).toEqual([
      "Source document — LLC Formation Services by State → WHAT VARIES BY STATE, AND WHAT DOES NOT (p. 3)",
      "National statement printed in another state's entry — Arizona — LLC Services & Requirements → Additional Services Available",
      "National statement printed in another state's entry — California — LLC Services & Requirements → Additional Services Available",
    ]);
    // Inherited first; no unknown rows.
    expect(rows[0].status).toBe("inherited");
    expect(rows.some((r) => r.status === "unknown")).toBe(false);
    expect(rows.find((r) => r.serviceKey === "boi_compliance")!.caveats[0]).toMatch(/fulfillment pipeline as unverified/);
  });

  it("Arizona: the national add-ons are printed in its own entry", async () => {
    const az = await detail("llc-az-state-services");
    const bank = sharedServiceRows(az).find((r) => r.serviceKey === "instant_bank_account")!;
    expect(bank).toMatchObject({ status: "direct", directlyMentioned: true, directSectionLabels: ["Additional Services Available"] });
    // The annual-report exception cites Arizona's own entry.
    const arf = unavailableRows(az).find((r) => r.serviceKey === "annual_report_filing")!;
    expect(arf.status).toBe("not_offered");
    expect(evidenceLabel(arf.evidence[0], az.id, arf.nationalEvidence)).toBe(
      "This state's entry — Arizona — LLC Services & Requirements → Annual Report and Renewal Filing",
    );
  });

  it("disputed services appear only as discrepancies, never as available", async () => {
    const de = await detail("llc-de-state-services");
    expect(disputedRows(de).map((r) => r.serviceKey).sort()).toEqual(["convert_llc_to_close_llc", "corporate_binder_seal"]);
    for (const r of disputedRows(de)) expect(r.presentation.confirmedAvailable).toBe(false);
    const binder = sharedServiceRows(de).find((r) => r.serviceKey === "corporate_binder_seal")!;
    expect(binder.presentation.label).toBe("Source discrepancy — not confirmed");
  });

  it("Wyoming-only products read as restricted elsewhere, citing Wyoming's entry", async () => {
    const ca = await detail("llc-ca-state-services");
    const instant = unavailableRows(ca).find((r) => r.serviceKey === "instant_formation")!;
    expect(instant.presentation.label).toBe("Restricted to other jurisdictions (per source)");
    expect(evidenceLabel(instant.evidence[0], ca.id, instant.nationalEvidence)).toBe(
      "Another state's entry — Wyoming — LLC Services & Requirements → State-Specific Requirements",
    );
  });
});

describe("search results", () => {
  it("builds query strings without empty filters", () => {
    expect(knowledgeSearchParams({ q: " banking ", entityType: "", jurisdiction: "FL", topic: "" })).toBe("q=banking&jurisdiction=FL");
    expect(knowledgeSearchParams({})).toBe("");
  });

  it("a search for banking explains Florida's match as inherited, Arizona's as printed", async () => {
    const results = await list("?q=banking");
    const fl = results.find((a) => a.jurisdictionCode === "FL")!;
    const az = results.find((a) => a.jurisdictionCode === "AZ")!;
    expect(explainMatch(fl, { q: "banking" })).toEqual({ sections: [], inherited: ["Instant Bank Account"], disputed: [] });
    expect(explainMatch(az, { q: "banking" })!.sections).toEqual(["Additional Services Available"]);
    expect(explainMatch(az, { q: "banking" })!.inherited).toEqual([]);
  });

  it("a topic filter that only matches through inheritance says so", async () => {
    const [fl] = await list("?topic=banking&jurisdiction=FL");
    expect(explainMatch(fl, { topic: "banking" })).toEqual({ sections: [], inherited: ["Banking"], disputed: [] });
    const [az] = await list("?topic=banking&jurisdiction=AZ");
    expect(explainMatch(az, { topic: "banking" })!.inherited).toEqual([]);
  });

  it("a search naming a disputed service flags the discrepancy", async () => {
    const [az] = await list("?q=close%20llc&jurisdiction=AZ");
    expect(explainMatch(az, { q: "close llc" })!.disputed).toEqual(["Convert LLC to Close LLC"]);
  });

  it("no query, no explanation", async () => {
    const [ca] = await list("?jurisdiction=CA");
    expect(explainMatch(ca, {})).toBeNull();
  });

  it("filter options come only from articles that exist", async () => {
    const opts = filterOptions(await list());
    expect(opts.entityTypes).toEqual(["llc"]);
    expect(opts.jurisdictions.map((j) => j.code)).toEqual(["AZ", "CA", "DE", "FL", "WY"]);
    expect(opts.topics).toContain("banking");
    expect(opts.topics).not.toContain("trademark");
  });

  it("result rows surface the highlighted sections with their presentation", async () => {
    const [az] = await list("?jurisdiction=AZ");
    expect(highlightedOutline(az).map((h) => [h.label, h.presentation.tone])).toEqual([["Open Research Item — Publication", "unresolved"]]);
    const [wy] = await list("?jurisdiction=WY");
    expect(highlightedOutline(wy)).toEqual([]);
  });

  it("source dates render without a time-zone shift", () => {
    expect(formatSourceDate("2026-09-10")).toBe("Sep 10, 2026");
  });
});
