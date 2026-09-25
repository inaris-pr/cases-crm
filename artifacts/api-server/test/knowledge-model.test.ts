import { describe, it, expect } from "vitest";
import {
  LLC_SECTION_TEMPLATE,
  articleId,
  articleTitle,
  sectionCitation,
  sectionId,
  slugify,
  type KnowledgeArticleInput,
  type SectionTemplateEntry,
} from "../src/knowledge/model";
import { KnowledgeValidationError, articleProblems, validateKnowledgeContent } from "../src/knowledge/validate";
import { buildKnowledgeRepository } from "../src/knowledge/repository";
import { LLC_PILOT_ARTICLES } from "../src/knowledge/content/llcPilot";
import { LLC_SOURCE } from "../src/knowledge/content/llcSource";

/**
 * Phase 8 — the Knowledge Base content model and its validation rules.
 * Fixtures are copies of a real pilot article, broken one rule at a time.
 */

const clone = <T>(v: T): T => structuredClone(v);
const byCode = (code: string) => clone(LLC_PILOT_ARTICLES.find((a) => a.jurisdictionCode === code)!);
const problemsOf = (a: KnowledgeArticleInput, templates?: Partial<Record<"llc" | "corporation", readonly SectionTemplateEntry[]>>) =>
  articleProblems(a, [LLC_SOURCE], templates ? { templates } : {});
const expectProblem = (a: KnowledgeArticleInput, pattern: RegExp) =>
  expect(problemsOf(a).join("\n")).toMatch(pattern);

describe("a valid LLC article", () => {
  it("every pilot article passes validation", () => {
    for (const a of LLC_PILOT_ARTICLES) expect(`${a.id}: ${problemsOf(a).join("; ")}`).toBe(`${a.id}: `);
    expect(() => validateKnowledgeContent(LLC_PILOT_ARTICLES, [LLC_SOURCE])).not.toThrow();
  });
});

describe("stable identity", () => {
  it("id, title and slug are functions of entity type + jurisdiction + article type", () => {
    expect(articleId("llc", "CA", "state_services")).toBe("llc-ca-state-services");
    expect(articleTitle("California", "llc")).toBe("California — LLC Services & Requirements");
    expect(slugify(articleTitle("California", "llc"))).toBe("california-llc-services-and-requirements");
    expect(slugify(articleTitle("District of Columbia", "llc"))).toBe("district-of-columbia-llc-services-and-requirements");
    expect(articleId("corporation", "CA", "state_services")).toBe("corporation-ca-state-services");
  });

  it("section ids and citations address one section precisely", () => {
    expect(sectionId("llc-az-state-services", "open_research_item_publication")).toBe(
      "llc-az-state-services:open_research_item_publication",
    );
    expect(sectionCitation("Arizona — LLC Services & Requirements", "Annual Report and Renewal Filing")).toBe(
      "Arizona — LLC Services & Requirements → Annual Report and Renewal Filing",
    );
  });

  it("an id, title or slug that does not follow the rule is rejected", () => {
    const a = byCode("DE");
    a.id = "delaware";
    expectProblem(a, /id must be "llc-de-state-services"/);
    const b = byCode("DE");
    b.slug = "delaware-llc";
    expectProblem(b, /slug must be/);
    const c = byCode("DE");
    c.title = "Delaware LLC";
    expectProblem(c, /title must be/);
  });
});

describe("jurisdictions", () => {
  it("an unknown jurisdiction code is rejected", () => {
    const a = byCode("WY");
    (a as { jurisdictionCode: string }).jurisdictionCode = "XX";
    expectProblem(a, /unknown jurisdiction "XX"/);
  });

  it("a name that does not belong to the code is rejected", () => {
    const a = byCode("WY");
    a.jurisdictionName = "Wisconsin";
    expectProblem(a, /jurisdiction WY is "Wyoming", not "Wisconsin"/);
  });
});

describe("one article per jurisdiction per entity type", () => {
  it("a second LLC article for the same jurisdiction is rejected", () => {
    const dup = byCode("FL");
    expect(() => validateKnowledgeContent([...LLC_PILOT_ARTICLES, dup], [LLC_SOURCE])).toThrow(KnowledgeValidationError);
    try {
      validateKnowledgeContent([...LLC_PILOT_ARTICLES, dup], [LLC_SOURCE]);
    } catch (e) {
      expect((e as KnowledgeValidationError).problems.join("\n")).toMatch(
        /duplicate article for llc\/FL\/state_services: one article per jurisdiction per entity type/,
      );
    }
  });

  it("the repository refuses to build from invalid content", () => {
    const broken = clone(LLC_PILOT_ARTICLES);
    broken[0].sections.pop();
    expect(() => buildKnowledgeRepository(broken, [LLC_SOURCE])).toThrow(KnowledgeValidationError);
  });
});

describe("section order and completeness", () => {
  it("the LLC template is the source's nine sections, in order", () => {
    expect(LLC_SECTION_TEMPLATE.map((t) => t.label)).toEqual([
      "Formation Filing",
      "Registered Agent",
      "Annual Report and Renewal Filing",
      "Amendments and Secretary of State Filings",
      "Certificates and Certified Copies",
      "EIN and Tax Elections",
      "Formation Documents Included",
      "Additional Services Available",
      "State-Specific Requirements",
    ]);
  });

  it("a dropped standard section is rejected", () => {
    const a = byCode("CA");
    a.sections.splice(4, 1);
    a.sections.forEach((s, i) => (s.order = i + 1));
    expectProblem(a, /expected section "certificates_and_certified_copies"/);
  });

  it("two swapped sections are rejected", () => {
    const a = byCode("CA");
    [a.sections[1], a.sections[2]] = [a.sections[2], a.sections[1]];
    a.sections.forEach((s, i) => (s.order = i + 1));
    expectProblem(a, /expected section "registered_agent"/);
  });

  it("an order number that disagrees with the position is rejected", () => {
    const a = byCode("CA");
    a.sections[3].order = 7;
    expectProblem(a, /order 7 does not match its position 4/);
  });

  it("a dropped highlighted section is caught by the source's Contents marker", () => {
    const a = byCode("AZ");
    a.sections.pop();
    expectProblem(a, /Contents page marks this entry as having a highlighted section/);
  });

  it("the state-specific section's N/A marker must match its text", () => {
    const a = byCode("DE");
    const s = a.sections.find((x) => x.key === "state_specific_requirements")!;
    s.notApplicable = false;
    expectProblem(a, /notApplicable must match the "N\/A" text/);
  });
});

describe("flags and classification", () => {
  it("an open research item cannot be marked as documented fact", () => {
    const a = byCode("AZ");
    const ori = a.sections.find((s) => s.flag === "open_research_item")!;
    ori.verification = "documented";
    expectProblem(a, /exactly the open research items are "unverified"/);
  });

  it("an open research item cannot be reclassified as a requirement", () => {
    const a = byCode("AZ");
    const ori = a.sections.find((s) => s.flag === "open_research_item")!;
    ori.flag = "state_requirement";
    ori.verification = "documented";
    expectProblem(a, /heading implies flag "open_research_item", found "state_requirement"/);
  });

  it("a client disclosure keeps the source's required / recommended level", () => {
    const a = byCode("FL");
    a.sections.find((s) => s.flag === "client_disclosure")!.clientDisclosure = "required";
    expectProblem(a, /heading implies client disclosure "recommended", found "required"/);
  });

  it("a standard section cannot carry a flag", () => {
    const a = byCode("WY");
    a.sections[0].flag = "state_requirement";
    expectProblem(a, /a standard section has no flag/);
  });
});

describe("tags must be supported by the section text", () => {
  it("a topic the section does not mention is rejected", () => {
    const a = byCode("DE");
    a.sections[0].topics.push("publication");
    expectProblem(a, /topic "publication" is not supported by the section text/);
  });

  it("a service the section does not name is rejected", () => {
    const a = byCode("DE");
    a.sections[0].serviceKeys.push("apostille");
    expectProblem(a, /service "apostille" is not named in the section text/);
  });

  it("a no-filing jurisdiction cannot sell a renewal filing", () => {
    const a = byCode("AZ");
    a.sections[2].serviceKeys.push("annual_report_filing");
    expectProblem(a, /no-filing jurisdiction cannot list the annual report filing service/);
  });

  it("a service-profile value must quote its section exactly", () => {
    const a = byCode("FL");
    a.serviceProfile.formationFulfillment.evidence.quote = "filed automatically in all 50 states";
    expectProblem(a, /formationFulfillment quote is not in section "formation_filing"/);
  });
});

describe("provenance and status", () => {
  it("an article cannot claim counsel review its source never had", () => {
    const a = byCode("CA");
    a.counselReviewed = true;
    expectProblem(a, /source was not reviewed by counsel/);
  });

  it("an article from an internal-only source must be internal-only", () => {
    const a = byCode("CA");
    a.internalOnly = false;
    expectProblem(a, /source is internal-only, so the article must be too/);
  });

  it("an unknown source is rejected", () => {
    const a = byCode("CA");
    a.provenance.sourceId = "somewhere-else";
    expectProblem(a, /unknown source "somewhere-else"/);
  });

  it("an unknown status or a customer-facing audience is rejected", () => {
    const a = byCode("CA");
    (a as { status: string }).status = "approved";
    expectProblem(a, /unknown status "approved"/);
    const b = byCode("CA");
    (b as { audience: string }).audience = "customer";
    expectProblem(b, /unknown audience "customer"/);
  });

  it("draft and archived are valid statuses", () => {
    for (const status of ["draft", "archived"] as const) {
      const a = byCode("CA");
      a.status = status;
      expect(problemsOf(a)).toEqual([]);
    }
  });
});

describe("Corporation articles later, without a redesign", () => {
  /** A stand-in template: the real one is defined from the Corporation source when it is ingested. */
  const CORP_TEMPLATE: SectionTemplateEntry[] = LLC_SECTION_TEMPLATE.map((t) => ({ ...t }));
  const corporationFrom = (llc: KnowledgeArticleInput): KnowledgeArticleInput => {
    const c = clone(llc);
    c.entityType = "corporation";
    c.title = articleTitle(c.jurisdictionName, "corporation");
    c.id = articleId("corporation", c.jurisdictionCode, c.articleType);
    c.slug = slugify(c.title);
    return c;
  };
  const corpSource = { ...clone(LLC_SOURCE), id: "corporations-reference-test", entityType: "corporation" as const };

  it("is refused until a Corporation section template exists", () => {
    const c = corporationFrom(byCode("CA"));
    c.provenance.sourceId = corpSource.id;
    expect(articleProblems(c, [LLC_SOURCE, corpSource]).join("\n")).toMatch(
      /no section template is defined for corporation articles yet/,
    );
  });

  it("with a template, a Corporation article validates and coexists with the LLC article", () => {
    const c = corporationFrom(byCode("CA"));
    c.provenance.sourceId = corpSource.id;
    const templates = { llc: LLC_SECTION_TEMPLATE, corporation: CORP_TEMPLATE };
    expect(articleProblems(c, [LLC_SOURCE, corpSource], { templates })).toEqual([]);
    const repo = buildKnowledgeRepository([...LLC_PILOT_ARTICLES, c], [LLC_SOURCE, corpSource], { templates });
    expect(repo.byIdOrSlug("corporation-ca-state-services")?.title).toBe("California — Corporation Services & Requirements");
    expect(repo.byIdOrSlug("llc-ca-state-services")?.entityType).toBe("llc");
  });

  it("LLC content cannot be filed under a Corporation source", () => {
    const a = byCode("CA");
    a.provenance.sourceId = corpSource.id;
    expect(articleProblems(a, [LLC_SOURCE, corpSource]).join("\n")).toMatch(/source corporations-reference-test is for corporation content/);
  });
});
