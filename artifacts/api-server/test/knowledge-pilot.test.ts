import { describe, it, expect } from "vitest";
import { knowledgeBase, readable } from "../src/knowledge/repository";
import { LLC_PILOT_ARTICLES } from "../src/knowledge/content/llcPilot";
import { LLC_SOURCE } from "../src/knowledge/content/llcSource";
import { LLC_SECTION_TEMPLATE } from "../src/knowledge/model";
import { LLC_PILOT_SOURCE_PAGES, LLC_PILOT_SOURCE_SHA256 } from "./fixtures/llcPilotSourceExtract";

/**
 * Phase 8 — the five LLC pilot articles against their source,
 * LLC-Formation-Services-by-State.pdf.
 *
 * The fidelity checks re-read the raw `pdftotext -raw` lines of each pilot
 * entry (test/fixtures) with a parser written here, independently of the
 * generator, and require every stored section to be the source's section:
 * same headings, same order, same words. No assertion below is prose written
 * for the test; quoted strings are copied from the source.
 */

const PILOT = ["AZ", "CA", "DE", "FL", "WY"] as const;
const art = (code: string) => knowledgeBase.byIdOrSlug(`llc-${code.toLowerCase()}-state-services`)!;

// ── Independent parse of the source extract ─────────────────────────────────

interface SourceSection {
  heading: string;
  text: string;
  pages: number[];
}

function parseEntry(code: string): { header: string; pages: number[]; sections: SourceSection[] } {
  const pages = LLC_PILOT_SOURCE_PAGES.filter((p) => p.jurisdictionCode === code);
  const header = pages[0].lines[0];
  const sections: { heading: string; lines: string[]; pages: number[] }[] = [];
  pages.forEach((pg, pi) => {
    const lines = pi === 0 ? pg.lines.slice(1) : pg.lines;
    for (const line of lines) {
      // A heading is a line in capitals (letters, spaces, hyphens, em dashes).
      if (/^[A-Z][A-Z \-—/,&]+[A-Z]$/.test(line)) sections.push({ heading: line, lines: [], pages: [pg.page] });
      else {
        const cur = sections[sections.length - 1];
        cur.lines.push(line);
        if (!cur.pages.includes(pg.page)) cur.pages.push(pg.page);
      }
    }
  });
  return {
    header,
    pages: pages.map((p) => p.page),
    sections: sections.map((s) => ({
      heading: s.heading,
      pages: s.pages,
      // Printed line breaks become one space; a line-final hyphen joins its word ("state-" + "restricted").
      text: s.lines.reduce((acc, l) => (!acc ? l : acc.endsWith("-") && /^[a-z]/.test(l) ? acc + l : `${acc} ${l}`), ""),
    })),
  };
}

// ── The pilot set ────────────────────────────────────────────────────────────

describe("the pilot set", () => {
  it("is exactly five published LLC articles: Arizona, California, Delaware, Florida, Wyoming", () => {
    expect(knowledgeBase.all.map((a) => `${a.entityType}:${a.jurisdictionCode}:${a.jurisdictionName}`).sort()).toEqual([
      "llc:AZ:Arizona",
      "llc:CA:California",
      "llc:DE:Delaware",
      "llc:FL:Florida",
      "llc:WY:Wyoming",
    ]);
    expect(readable().length).toBe(5);
    expect(knowledgeBase.all.every((a) => a.status === "published" && a.articleType === "state_services")).toBe(true);
  });

  it("contains no Corporation article", () => {
    expect(knowledgeBase.all.filter((a) => a.entityType !== "llc")).toEqual([]);
    expect(knowledgeBase.sources.map((s) => s.entityType)).toEqual(["llc"]);
  });

  it("titles, ids and slugs", () => {
    expect(knowledgeBase.all.map((a) => [a.id, a.slug, a.title])).toEqual([
      ["llc-az-state-services", "arizona-llc-services-and-requirements", "Arizona — LLC Services & Requirements"],
      ["llc-ca-state-services", "california-llc-services-and-requirements", "California — LLC Services & Requirements"],
      ["llc-de-state-services", "delaware-llc-services-and-requirements", "Delaware — LLC Services & Requirements"],
      ["llc-fl-state-services", "florida-llc-services-and-requirements", "Florida — LLC Services & Requirements"],
      ["llc-wy-state-services", "wyoming-llc-services-and-requirements", "Wyoming — LLC Services & Requirements"],
    ]);
  });

  it("is frozen: nothing can change an article at run time", () => {
    const a = art("CA");
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.sections[0])).toBe(true);
    expect(() => {
      (a.sections[0] as { content: string }).content = "changed";
    }).toThrow();
  });
});

// ── Fidelity to the source ───────────────────────────────────────────────────

describe("fidelity to LLC-Formation-Services-by-State.pdf", () => {
  it("the extract and the articles come from the same file", () => {
    expect(LLC_SOURCE.sha256).toBe(LLC_PILOT_SOURCE_SHA256);
  });

  for (const code of PILOT) {
    describe(code, () => {
      const source = parseEntry(code);
      const a = art(code);

      it("comes from the right entry and pages", () => {
        expect(a.provenance.sourceEntryHeader).toBe(source.header);
        expect(source.header).toBe(`${a.jurisdictionName} ${code}`);
        expect(a.provenance.pages).toEqual(source.pages);
      });

      it("has every source section — same headings, same order, nothing dropped or added", () => {
        expect(a.sections.map((s) => s.sourceHeading)).toEqual(source.sections.map((s) => s.heading));
        expect(a.sections.map((s) => s.order)).toEqual(source.sections.map((_, i) => i + 1));
      });

      it("keeps each section's words exactly", () => {
        a.sections.forEach((s, i) => {
          expect(`${s.key}: ${s.content}`).toBe(`${s.key}: ${source.sections[i].text}`);
          expect(s.sourcePages).toEqual(source.sections[i].pages);
        });
      });

      it("starts with the nine canonical sections, in order", () => {
        expect(a.sections.slice(0, 9).map((s) => s.key)).toEqual(LLC_SECTION_TEMPLATE.map((t) => t.key));
        expect(a.sections.slice(0, 8).every((s) => s.kind === "standard")).toBe(true);
        expect(a.sections[8].kind).toBe("state_specific");
        expect(a.sections.slice(9).every((s) => s.kind === "highlighted")).toBe(true);
      });
    });
  }
});

// ── Highlighted sections and flags, per jurisdiction ─────────────────────────

const highlighted = (code: string) =>
  art(code)
    .sections.filter((s) => s.kind === "highlighted")
    .map((s) => ({ label: s.label, flag: s.flag, clientDisclosure: s.clientDisclosure, verification: s.verification, highlightCategory: s.highlightCategory }));

describe("highlighted sections keep their classification", () => {
  it("Arizona: the publication Open Research Item stays an unresolved question", () => {
    expect(highlighted("AZ")).toEqual([
      {
        label: "Open Research Item — Publication",
        flag: "open_research_item",
        clientDisclosure: null,
        verification: "unverified",
        highlightCategory: "open_research_item",
      },
    ]);
    const ori = art("AZ").sections.find((s) => s.flag === "open_research_item")!;
    expect(ori.id).toBe("llc-az-state-services:open_research_item_publication");
    expect(ori.citation).toBe("Arizona — LLC Services & Requirements → Open Research Item — Publication");
    expect(ori.content).toContain("LLC applicability has not been verified in our documentation.");
    expect(art("AZ").flagSummary.openResearchItems).toBe(1);
    // Nothing else in any pilot article is unverified.
    const unverified = knowledgeBase.all.flatMap((a) => a.sections.filter((s) => s.verification === "unverified").map((s) => s.id));
    expect(unverified).toEqual(["llc-az-state-services:open_research_item_publication"]);
  });

  it("Arizona: no annual report, and no renewal filing sold", () => {
    expect(art("AZ").serviceProfile.renewalCadence.value).toBe("no_filing");
    expect(art("AZ").serviceProfile.renewalDueDate.value).toBeNull();
    expect(art("AZ").serviceProfile.renewalFulfillment.value).toBe("not_offered");
    expect(art("AZ").serviceKeys).not.toContain("annual_report_filing");
  });

  it("California: franchise tax, client disclosure REQUIRED", () => {
    expect(highlighted("CA")).toEqual([
      {
        label: "Franchise Tax — Client Disclosure Required",
        flag: "client_disclosure",
        clientDisclosure: "required",
        verification: "documented",
        highlightCategory: "franchise_tax_annual_tax_or_annual_fee",
      },
    ]);
  });

  it("Delaware: annual tax, a state requirement", () => {
    expect(highlighted("DE")).toEqual([
      {
        label: "Annual Tax",
        flag: "state_requirement",
        clientDisclosure: null,
        verification: "documented",
        highlightCategory: "franchise_tax_annual_tax_or_annual_fee",
      },
    ]);
  });

  it("Florida: fees and late penalty, client disclosure RECOMMENDED — a title the source does not list", () => {
    expect(highlighted("FL")).toEqual([
      {
        label: "Fees and Late Penalty — Client Disclosure Recommended",
        flag: "client_disclosure",
        clientDisclosure: "recommended",
        verification: "documented",
        highlightCategory: "unlisted",
      },
    ]);
  });

  it("Wyoming: no highlighted section (its Contents entry carries no marker)", () => {
    expect(highlighted("WY")).toEqual([]);
    expect(art("WY").provenance.contentsMarksHighlighted).toBe(false);
  });

  it("no pilot article has a known service gap or a source discrepancy", () => {
    for (const a of knowledgeBase.all) {
      expect(a.flagSummary.knownServiceGaps + a.flagSummary.sourceDiscrepancies).toBe(0);
    }
  });

  it("the state-specific section: N/A for Delaware and Florida, content elsewhere", () => {
    const ss = (code: string) => art(code).sections.find((s) => s.key === "state_specific_requirements")!;
    for (const code of ["DE", "FL"]) {
      expect(ss(code)).toMatchObject({ notApplicable: true, flag: "none" });
      expect(ss(code).content.startsWith("N/A")).toBe(true);
    }
    for (const code of ["AZ", "CA", "WY"]) expect(ss(code)).toMatchObject({ notApplicable: false, flag: "state_requirement" });
  });
});

// ── Fulfillment metadata ─────────────────────────────────────────────────────

describe("service profile reflects the source", () => {
  const profile = (code: string) => {
    const sp = art(code).serviceProfile;
    return [
      sp.formationFulfillment.value,
      sp.registeredAgent.value,
      sp.renewalCadence.value,
      sp.renewalDueDate.value,
      sp.renewalFulfillment.value,
      sp.addOnServiceCount.value,
    ];
  };

  it("Florida and Wyoming formations are automated in-house; Delaware goes to the vendor API; Arizona and California are manual", () => {
    expect(profile("FL")).toEqual(["automated_in_house", "in_house", "annual", "May 1", "automated", 32]);
    expect(profile("WY")).toEqual([
      "automated_in_house",
      "in_house",
      "annual",
      "First day of the formation-anniversary month",
      "automated",
      34,
    ]);
    expect(profile("DE")).toEqual(["vendor_api", "vendor_network", "annual", "June 1", "automated", 31]);
    expect(profile("CA")).toEqual([
      "manual_case",
      "vendor_network",
      "biennial",
      "First day of the formation-anniversary month",
      "manual",
      30,
    ]);
    expect(profile("AZ")).toEqual(["manual_case", "vendor_network", "no_filing", null, "not_offered", 30]);
  });

  it("every profile value is backed by a verbatim quote from its section", () => {
    for (const a of knowledgeBase.all) {
      for (const [field, v] of Object.entries(a.serviceProfile)) {
        const section = a.sections.find((s) => s.key === v.evidence.sectionKey);
        expect(`${a.id}.${field}: ${section?.content.includes(v.evidence.quote)}`).toBe(`${a.id}.${field}: true`);
      }
    }
  });

  it("the Florida and Wyoming formation text says the filing is automated", () => {
    for (const code of ["FL", "WY"]) {
      expect(art(code).sections[0].content).toContain("Fulfillment: in-house automated filing via our Puppeteer worker");
    }
  });
});

// ── Provenance ───────────────────────────────────────────────────────────────

describe("provenance and internal-use status", () => {
  it("every article is internal, not counsel-reviewed, with no review date invented", () => {
    for (const a of knowledgeBase.all) {
      expect(a).toMatchObject({
        audience: "internal",
        internalOnly: true,
        counselReviewed: false,
        lastReviewedAt: null,
        provenance: { sourceId: "llc-formation-services-by-state-2026-09-10" },
      });
    }
  });

  it("the source record carries the document's own confidentiality notice", () => {
    const src = knowledgeBase.source("llc-formation-services-by-state-2026-09-10")!;
    expect(src).toMatchObject({
      fileName: "LLC-Formation-Services-by-State.pdf",
      preparedDate: "2026-09-10",
      confidentiality: "CONFIDENTIAL — INTERNAL REFERENCE",
      internalOnly: true,
      counselReviewed: false,
    });
    const notice = src.notices.find((n) => n.key === "confidentiality")!;
    expect(notice.text).toContain("It is not customer-facing collateral and has not been reviewed by counsel.");
    expect(src.notices.find((n) => n.key === "service_gaps_and_research_items")!.text).toContain(
      "treat those as unanswered questions, not as settled facts.",
    );
  });

  it("topics come from the source text of the section they are on", () => {
    // validate.ts enforces the evidence rule; spot-check the tags a Case match would use.
    expect(art("AZ").sections.find((s) => s.topics.includes("publication"))?.key).toBe("open_research_item_publication");
    expect(art("CA").topics).toContain("franchise_tax");
    expect(art("DE").topics).toContain("annual_tax");
    expect(art("FL").topics).toContain("late_penalty");
    expect(art("WY").topics).not.toContain("publication");
    // Delaware, Florida and Wyoming do not restate the national add-on list, so they carry no such topics.
    for (const code of ["DE", "FL", "WY"]) expect(art(code).topics).not.toContain("boi_compliance");
    expect(art("AZ").topics).toContain("boi_compliance");
  });

  it("stored content matches the generated module (no run-time rewriting)", () => {
    for (const input of LLC_PILOT_ARTICLES) {
      const a = knowledgeBase.byIdOrSlug(input.id)!;
      expect(a.sections.map((s) => s.content)).toEqual(input.sections.map((s) => s.content));
    }
  });
});
