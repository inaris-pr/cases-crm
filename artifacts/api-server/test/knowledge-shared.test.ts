import { describe, it, expect } from "vitest";
import { buildKnowledgeRepository, knowledgeBase, type KnowledgeRepository } from "../src/knowledge/repository";
import { LLC_PILOT_ARTICLES } from "../src/knowledge/content/llcPilot";
import { LLC_SOURCE } from "../src/knowledge/content/llcSource";
import { LLC_SHARED_SERVICES, LLC_SOURCE_DISCREPANCIES } from "../src/knowledge/content/llcShared";
import { sharedContentProblems } from "../src/knowledge/validate";
import type { KnowledgeArticleInput, KnowledgeSharedService, ServiceKey } from "../src/knowledge/model";
import { LLC_PILOT_SOURCE_PAGES } from "./fixtures/llcPilotSourceExtract";

/**
 * Phase 8A follow-up — shared (national) services vs. jurisdiction content.
 *
 *   direct     = printed in the jurisdiction's own entry
 *   inherited  = not printed there, but an explicit, uncontested national
 *                source rule applies
 *   effective  = direct ∪ inherited (never disputed / restricted / not offered)
 * Silence is never "not offered". Contradictions stay unresolved.
 */

const clone = <T>(v: T): T => structuredClone(v);
const art = (code: string, repo: KnowledgeRepository = knowledgeBase) =>
  repo.byIdOrSlug(`llc-${code.toLowerCase()}-state-services`)!;
const status = (code: string, key: ServiceKey, repo: KnowledgeRepository = knowledgeBase) =>
  art(code, repo).serviceAvailability.find((x) => x.serviceKey === key)!;
const statusOf = (code: string, key: ServiceKey, repo?: KnowledgeRepository) => {
  const s = status(code, key, repo);
  return `${s.status}/${s.reason}`;
};
const NATIONAL_ENTRY_LIST: ServiceKey[] = [
  "virtual_office",
  "mail_forwarding",
  "instant_bank_account",
  "business_insurance",
  "business_financing_referral",
  "boi_compliance",
];

// ── Shared services and their provenance ─────────────────────────────────────

describe("shared services come only from explicit source statements", () => {
  it("the shared content validates against the stored source text", () => {
    expect(sharedContentProblems(LLC_SHARED_SERVICES, LLC_SOURCE_DISCREPANCIES, LLC_PILOT_ARTICLES, [LLC_SOURCE])).toEqual([]);
  });

  it("the nationally offered services are exactly the ones the source names", () => {
    const offered = LLC_SHARED_SERVICES.filter((r) => r.scope === "national" && r.availability === "offered")
      .map((r) => r.serviceKey)
      .sort();
    expect(offered).toEqual(
      [
        // p. 3: "LLC formation is selectable in all 50 states and the District of Columbia."
        "llc_formation",
        // p. 3: "EIN, operating agreements, S-corp and other tax elections, apostille, banking, the corporate binder,
        //        and the governance document library are priced flat nationally and do not vary."
        "ein", "operating_agreement_update", "s_corp_election", "tax_classification_change", "apostille",
        "instant_bank_account", "corporate_binder_seal",
        "annual_meeting_minutes", "meeting_minutes_resolutions", "certificate_of_incumbency", "membership_change",
        // entries: "Available nationally regardless of state: …"
        "virtual_office", "mail_forwarding", "business_insurance", "business_financing_referral", "boi_compliance",
      ].sort(),
    );
    const notOffered = LLC_SHARED_SERVICES.filter((r) => r.scope === "national" && r.availability === "not_offered").map((r) => r.serviceKey).sort();
    expect(notOffered).toEqual(["business_license_services", "tax_preparation_filing", "trademark_registration"]);
    // The only jurisdiction-specific records: Arizona's "no renewal filing is sold" and the Wyoming-only products.
    expect(LLC_SHARED_SERVICES.filter((r) => r.scope === "jurisdictions").map((r) => `${r.serviceKey}:${r.jurisdictions}:${r.availability}`)).toEqual([
      "annual_report_filing:AZ:not_offered",
      "instant_formation:WY:exclusive",
      "custom_operating_agreement:WY:exclusive",
      "dba_cancellation:WY:exclusive",
      "dba_reassignment:WY:exclusive",
      "convert_llc_to_close_llc:WY:exclusive",
    ]);
  });

  it("every record carries verbatim evidence and a citation path", () => {
    for (const r of knowledgeBase.sharedServices) {
      expect(`${r.id}: ${r.evidence.length > 0}`).toBe(`${r.id}: true`);
      for (const e of r.evidence) {
        expect(e.quote).toContain(e.term);
        expect(e.citation).toMatch(/^(LLC Formation Services by State → .+ \(p\. \d+\)|.+ — LLC Services & Requirements → .+)$/);
      }
    }
    const bank = knowledgeBase.sharedServices.find((r) => r.id === "llc-shared:instant_bank_account:national-offered")!;
    expect(bank.evidence.map((e) => e.citation)).toEqual([
      "LLC Formation Services by State → WHAT VARIES BY STATE, AND WHAT DOES NOT (p. 3)",
      "Arizona — LLC Services & Requirements → Additional Services Available",
      "California — LLC Services & Requirements → Additional Services Available",
    ]);
  });

  it("the in-entry national sentence is the source's own words, as printed in the Arizona entry", () => {
    const az = LLC_PILOT_SOURCE_PAGES.filter((p) => p.jurisdictionCode === "AZ").flatMap((p) => p.lines).join(" ");
    expect(az).toContain("Available nationally regardless of state: Virtual Office and commercial business address");
  });

  it("a record whose quote is not in the source is refused", () => {
    const bad = clone(LLC_SHARED_SERVICES);
    bad[1].evidence[0].quote = "EIN is available in every state.";
    expect(sharedContentProblems(bad, LLC_SOURCE_DISCREPANCIES, LLC_PILOT_ARTICLES, [LLC_SOURCE]).join("\n")).toMatch(
      /quote is not in the cited source text/,
    );
  });

  it("a record with no evidence (inference alone) is refused", () => {
    const inferred: KnowledgeSharedService = {
      id: "llc-shared:foreign_ein:national-offered",
      entityType: "llc",
      serviceKey: "foreign_ein",
      scope: "national",
      jurisdictions: null,
      availability: "offered",
      termsVaryByState: false,
      topics: ["ein"],
      evidence: [],
      caveats: [],
      mappingNote: "Appears in all five pilot entries.",
    };
    expect(
      sharedContentProblems([...LLC_SHARED_SERVICES, inferred], LLC_SOURCE_DISCREPANCIES, LLC_PILOT_ARTICLES, [LLC_SOURCE]).join("\n"),
    ).toMatch(/foreign_ein:national-offered: has no source evidence/);
  });

  it("a service printed in every pilot entry is NOT national without a national statement", () => {
    // Foreign EIN appears in all five entries, but the source never calls it national.
    expect(LLC_SHARED_SERVICES.some((r) => r.serviceKey === "foreign_ein")).toBe(false);
    const withoutIt = clone(LLC_PILOT_ARTICLES);
    const fl = withoutIt.find((a) => a.jurisdictionCode === "FL")!;
    for (const s of fl.sections) s.serviceKeys = s.serviceKeys.filter((k) => k !== "foreign_ein");
    const repo = buildKnowledgeRepository(withoutIt, [LLC_SOURCE], { shared: LLC_SHARED_SERVICES, discrepancies: LLC_SOURCE_DISCREPANCIES });
    expect(statusOf("FL", "foreign_ein", repo)).toBe("unknown/no_statement");
  });

  it("an unrecorded contradiction is refused: dropping a discrepancy breaks validation", () => {
    const withoutBinder = LLC_SOURCE_DISCREPANCIES.filter((d) => d.id !== "llc-discrepancy:corporate-binder-scope");
    expect(sharedContentProblems(LLC_SHARED_SERVICES, withoutBinder, LLC_PILOT_ARTICLES, [LLC_SOURCE]).join("\n")).toMatch(
      /corporate_binder_seal: offered nationally by one record and limited by another, with no discrepancy recorded/,
    );
    const withoutCloseLlc = LLC_SOURCE_DISCREPANCIES.filter((d) => d.id !== "llc-discrepancy:convert-llc-to-close-llc-availability");
    const problems = sharedContentProblems(LLC_SHARED_SERVICES, withoutCloseLlc, LLC_PILOT_ARTICLES, [LLC_SOURCE]).join("\n");
    expect(problems).toMatch(/convert_llc_to_close_llc: llc-az-state-services lists it, but a source rule says it is not offered there/);
    expect(problems).toMatch(/convert_llc_to_close_llc: llc-ca-state-services lists it/);
  });

  it("BOI compliance carries the source's delivery-risk caveat wherever it applies", () => {
    for (const code of ["AZ", "FL"]) {
      expect(status(code, "boi_compliance").caveats.join(" ")).toContain("internal review has rated the fulfillment pipeline as unverified");
    }
  });
});

// ── Direct, inherited, effective ─────────────────────────────────────────────

describe("direct vs inherited vs effective metadata", () => {
  it("direct metadata is exactly what the entry prints (topics / serviceKeys unchanged)", () => {
    for (const input of LLC_PILOT_ARTICLES) {
      const a = knowledgeBase.byIdOrSlug(input.id)!;
      const printed = [...new Set(input.sections.flatMap((s) => s.serviceKeys))];
      expect(a.directServiceKeys).toEqual(printed);
      expect(a.serviceKeys).toEqual(printed);
      expect(a.directTopics).toEqual(a.topics);
    }
  });

  it("inherited metadata never overlaps direct metadata", () => {
    for (const a of knowledgeBase.all) {
      expect(a.inheritedServiceKeys.filter((k) => a.directServiceKeys.includes(k))).toEqual([]);
      expect(a.inheritedTopics.filter((t) => a.directTopics.includes(t))).toEqual([]);
    }
  });

  it("effective = direct (unless disputed/restricted) ∪ inherited", () => {
    for (const a of knowledgeBase.all) {
      const direct = a.serviceAvailability.filter((x) => x.status === "direct").map((x) => x.serviceKey);
      expect([...a.effectiveServiceKeys].sort()).toEqual([...direct, ...a.inheritedServiceKeys].sort());
      expect(a.effectiveTopics).toEqual([...a.directTopics, ...a.inheritedTopics]);
    }
  });

  it("every catalog service has an availability entry for every article", () => {
    for (const a of knowledgeBase.all) {
      expect(new Set(a.serviceAvailability.map((x) => x.serviceKey)).size).toBe(a.serviceAvailability.length);
      for (const x of a.serviceAvailability) expect(x.directlyMentioned).toBe(a.directServiceKeys.includes(x.serviceKey));
    }
  });

  it("omission is never 'not offered': a silent entry is inherited or unknown", () => {
    for (const a of knowledgeBase.all) {
      for (const x of a.serviceAvailability.filter((y) => y.status === "not_offered" || y.status === "restricted")) {
        // Every negative answer names the source rule that says so.
        expect(`${a.jurisdictionCode}.${x.serviceKey}: ${x.sharedServiceIds.length > 0}`).toBe(`${a.jurisdictionCode}.${x.serviceKey}: true`);
        expect(["not_offered_nationally", "not_offered_in_jurisdiction", "restricted_to_other_jurisdictions"]).toContain(x.reason);
      }
    }
  });
});

// ── The five pilot jurisdictions ─────────────────────────────────────────────

describe("pilot jurisdictions", () => {
  it("Delaware, Florida and Wyoming keep their exact Additional Services text", () => {
    const text = (code: string) => art(code).sections.find((s) => s.key === "additional_services_available")!.content;
    expect(text("DE")).toBe(
      "31 LLC add-on services are available in this jurisdiction — the 30-product baseline plus Convert LLC to Corporation.",
    );
    expect(text("FL")).toBe("32 LLC add-on services are available — the 30-product baseline plus Convert LLC to Corporation and DBA / Trade Name.");
    expect(text("WY")).toBe(
      "34 LLC add-on services are available — the highest of any jurisdiction. The 30-product baseline plus Convert LLC to Corporation, Custom Operating Agreement, Instant Formation, and DBA / Trade Name.",
    );
    for (const code of ["DE", "FL", "WY"]) expect(text(code)).not.toContain("Available nationally");
  });

  it("Delaware, Florida and Wyoming inherit the explicitly national services they do not print", () => {
    for (const code of ["DE", "FL", "WY"]) {
      for (const key of NATIONAL_ENTRY_LIST) {
        const x = status(code, key);
        expect(`${code}.${key} ${x.status} ${x.directlyMentioned} ${x.sourceScope}`).toBe(`${code}.${key} inherited false national`);
      }
      expect(art(code).inheritedServiceKeys).toEqual(NATIONAL_ENTRY_LIST);
      expect(art(code).inheritedTopics).toEqual([
        "virtual_office", "mail_forwarding", "banking", "business_insurance", "business_financing", "boi_compliance",
      ]);
    }
  });

  it("banking in Florida: national, not directly mentioned, with both citation paths", () => {
    const x = status("FL", "instant_bank_account");
    expect(x).toMatchObject({ status: "inherited", reason: "national_rule", directlyMentioned: false, sourceScope: "national", directSectionIds: [] });
    expect(x.sharedServiceIds).toEqual(["llc-shared:instant_bank_account:national-offered"]);
  });

  it("Arizona and California state those services directly", () => {
    for (const code of ["AZ", "CA"]) {
      for (const key of NATIONAL_ENTRY_LIST) {
        const x = status(code, key);
        expect(`${code}.${key} ${x.status}`).toBe(`${code}.${key} direct`);
        expect(x.directSectionIds).toEqual([`llc-${code.toLowerCase()}-state-services:additional_services_available`]);
      }
      expect(art(code).inheritedServiceKeys).toEqual([]);
    }
  });

  it("Convert LLC to Close LLC: the Wyoming restriction contradiction is not resolved", () => {
    for (const code of ["AZ", "CA"]) {
      const x = status(code, "convert_llc_to_close_llc");
      expect(x).toMatchObject({ status: "disputed", reason: "availability_disputed", directlyMentioned: true });
      expect(x.discrepancyIds).toEqual(["llc-discrepancy:convert-llc-to-close-llc-availability"]);
      // Still printed in the entry — the text and direct metadata are untouched.
      expect(art(code).directServiceKeys).toContain("convert_llc_to_close_llc");
      expect(art(code).effectiveServiceKeys).not.toContain("convert_llc_to_close_llc");
    }
    for (const code of ["DE", "FL"]) expect(statusOf(code, "convert_llc_to_close_llc")).toBe("disputed/availability_disputed");
    expect(statusOf("WY", "convert_llc_to_close_llc")).toBe("direct/stated_in_entry");
    const d = knowledgeBase.discrepancies.find((x) => x.id === "llc-discrepancy:convert-llc-to-close-llc-availability")!;
    expect(d.resolution).toBeNull();
    expect(d.claims.map((c) => c.citation)).toEqual([
      "Arizona — LLC Services & Requirements → Additional Services Available",
      "California — LLC Services & Requirements → Additional Services Available",
      "Wyoming — LLC Services & Requirements → State-Specific Requirements",
    ]);
  });

  it("the corporate binder's national scope is contested, so it is never inherited", () => {
    for (const code of ["DE", "FL", "WY"]) expect(statusOf(code, "corporate_binder_seal")).toBe("disputed/national_rule_disputed");
    for (const code of ["AZ", "CA"]) {
      const x = status(code, "corporate_binder_seal");
      expect(`${x.status}/${x.reason}`).toBe("direct/stated_in_entry");
      expect(x.discrepancyIds).toEqual(["llc-discrepancy:corporate-binder-scope"]);
    }
  });

  it("Wyoming-only products are restricted elsewhere and direct in Wyoming", () => {
    for (const key of ["instant_formation", "custom_operating_agreement", "dba_cancellation", "dba_reassignment"] as ServiceKey[]) {
      for (const code of ["AZ", "CA", "DE", "FL"]) expect(`${code}.${key} ${statusOf(code, key)}`).toBe(`${code}.${key} restricted/restricted_to_other_jurisdictions`);
      expect(statusOf("WY", key)).toBe("direct/stated_in_entry");
    }
  });

  it("state-varying services the entry does not print stay unknown, never inherited", () => {
    for (const key of ["foreign_registration", "dissolution", "reinstatement"] as ServiceKey[]) {
      for (const code of ["DE", "FL", "WY"]) expect(`${code}.${key} ${statusOf(code, key)}`).toBe(`${code}.${key} unknown/varies_by_state_not_stated`);
      for (const code of ["AZ", "CA"]) expect(statusOf(code, key)).toBe("direct/stated_in_entry");
    }
    expect(statusOf("DE", "dba")).toBe("unknown/varies_by_state_not_stated");
    expect(statusOf("FL", "dba")).toBe("direct/stated_in_entry");
    expect(statusOf("AZ", "convert_llc_to_corporation")).toBe("unknown/varies_by_state_not_stated");
  });

  it("Arizona: its entry's explicit 'no renewal filing is sold' is a jurisdiction exception, not silence", () => {
    const x = status("AZ", "annual_report_filing");
    expect(x).toMatchObject({ status: "not_offered", reason: "not_offered_in_jurisdiction", sourceScope: "jurisdiction", directlyMentioned: false });
    expect(x.sharedServiceIds).toContain("llc-shared:annual_report_filing:az-not-offered");
    for (const code of ["CA", "DE", "FL", "WY"]) expect(statusOf(code, "annual_report_filing")).toBe("direct/stated_in_entry");
  });

  it("services the source says are not products are not offered anywhere", () => {
    for (const a of knowledgeBase.all) {
      for (const key of ["trademark_registration", "business_license_services", "tax_preparation_filing"] as ServiceKey[]) {
        expect(statusOf(a.jurisdictionCode, key)).toBe("not_offered/not_offered_nationally");
      }
    }
  });
});

// ── Precedence ───────────────────────────────────────────────────────────────

describe("precedence", () => {
  /** A synthetic Florida entry that states an exception, plus a jurisdiction rule citing it. */
  function withFloridaException() {
    const articles = clone(LLC_PILOT_ARTICLES) as KnowledgeArticleInput[];
    const fl = articles.find((a) => a.jurisdictionCode === "FL")!;
    const sec = fl.sections.find((s) => s.key === "additional_services_available")!;
    sec.content += " Virtual Office is not available in this jurisdiction.";
    const exception: KnowledgeSharedService = {
      id: "test:virtual_office:fl-not-offered",
      entityType: "llc",
      serviceKey: "virtual_office",
      scope: "jurisdictions",
      jurisdictions: ["FL"],
      availability: "not_offered",
      termsVaryByState: false,
      topics: ["virtual_office"],
      evidence: [
        {
          sourceId: LLC_SOURCE.id,
          location: { kind: "article_section", articleId: "llc-fl-state-services", sectionKey: "additional_services_available" },
          quote: "Virtual Office is not available in this jurisdiction.",
          term: "Virtual Office",
        },
      ],
      caveats: [],
      mappingNote: null,
    };
    return buildKnowledgeRepository(articles, [LLC_SOURCE], {
      shared: [...LLC_SHARED_SERVICES, exception],
      discrepancies: LLC_SOURCE_DISCREPANCIES,
    });
  }

  it("an explicit jurisdiction exception beats an uncontested national default", () => {
    const repo = withFloridaException();
    expect(statusOf("FL", "virtual_office", repo)).toBe("not_offered/not_offered_in_jurisdiction");
    expect(status("FL", "virtual_office", repo).sourceScope).toBe("jurisdiction");
    expect(art("FL", repo).effectiveServiceKeys).not.toContain("virtual_office");
    // Only Florida changes.
    expect(statusOf("DE", "virtual_office", repo)).toBe("inherited/national_rule");
    expect(statusOf("AZ", "virtual_office", repo)).toBe("direct/stated_in_entry");
  });

  it("silence inherits only when a national rule exists", () => {
    const repo = buildKnowledgeRepository(LLC_PILOT_ARTICLES, [LLC_SOURCE]); // no shared rules at all
    expect(statusOf("FL", "instant_bank_account", repo)).toBe("unknown/no_statement");
    expect(art("FL", repo).inheritedServiceKeys).toEqual([]);
    expect(statusOf("FL", "instant_bank_account")).toBe("inherited/national_rule");
  });

  it("a source discrepancy yields disputed, not confident availability", () => {
    const disputed = knowledgeBase.all.flatMap((a) => a.serviceAvailability.filter((x) => x.status === "disputed").map((x) => `${a.jurisdictionCode}.${x.serviceKey}`));
    expect(disputed.sort()).toEqual(
      [
        "AZ.convert_llc_to_close_llc", "CA.convert_llc_to_close_llc", "DE.convert_llc_to_close_llc", "FL.convert_llc_to_close_llc",
        "DE.corporate_binder_seal", "FL.corporate_binder_seal", "WY.corporate_binder_seal",
      ].sort(),
    );
    for (const a of knowledgeBase.all) for (const k of a.disputedServiceKeys) expect(a.effectiveServiceKeys).not.toContain(k);
  });
});
