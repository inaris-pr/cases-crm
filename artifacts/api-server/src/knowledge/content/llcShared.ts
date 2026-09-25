/**
 * Shared (national) LLC service rules and source discrepancies — Phase 8A
 * follow-up.
 *
 * AUTHORED classification over VERBATIM quotes. Each record exists only
 * because LLC-Formation-Services-by-State.pdf states a scope explicitly:
 *   - Scope and caveats (p. 3): "WHAT VARIES BY STATE, AND WHAT DOES NOT",
 *     "SERVICES WE DO NOT PROVIDE", "ONE DELIVERY RISK WORTH KNOWING";
 *   - the sentences printed inside the entries' Additional Services section
 *     ("Available nationally regardless of state: …", "State-varying services
 *     include …") — cited here from the Arizona and California entries;
 *   - Wyoming's "Products restricted to Wyoming: …";
 *   - Arizona's "no renewal filing is sold" (a jurisdiction exception).
 * A service appearing in many entries is NOT a reason to add a record here.
 * validate.ts checks every quote against the stored source text.
 *
 * Nothing in this file is copied into any article: articles keep exactly
 * what their own entry prints. These records feed the derived
 * `serviceAvailability`, `inheritedServiceKeys` and `effective*` metadata.
 */
import type {
  JurisdictionCode,
  KnowledgeSharedService,
  KnowledgeSourceDiscrepancy,
  KnowledgeTopic,
  ServiceKey,
  SharedAvailability,
  SharedEvidence,
} from "../model.js";

const SOURCE = "llc-formation-services-by-state-2026-09-10";

// ── Verbatim passages ────────────────────────────────────────────────────────

/** p. 3, "WHAT VARIES BY STATE, AND WHAT DOES NOT". */
const P3_FORMATION = "LLC formation is selectable in all 50 states and the District of Columbia.";
const P3_VARY =
  "The services that genuinely vary by state are formation filing, registered agent, annual report and renewal filing, amendments, certificates and certified copies, DBA, foreign registration, dissolution, and conversions.";
const P3_FLAT =
  "EIN, operating agreements, S-corp and other tax elections, apostille, banking, the corporate binder, and the governance document library are priced flat nationally and do not vary.";
/** p. 3, "SERVICES WE DO NOT PROVIDE". */
const P3_TRADEMARK = "Trademark registration is not a product.";
const P3_LICENSE =
  "Standalone business license research, application, or renewal is not a product — business licenses appear only as pass-through companion fees at formation checkout in Nevada, Alaska, the District of Columbia, and Hawaii.";
const P3_TAX =
  "Tax preparation and tax filing are not products; our tax-adjacent services are IRS election and information-update forms only.";
/** p. 3, "ONE DELIVERY RISK WORTH KNOWING". */
const P3_BOI_RISK =
  "Corporate Transparency Act and BOI compliance is sold and is bundled broadly, but internal review has rated the fulfillment pipeline as unverified — the submission worker is not present and the filing timestamps show no recent activity. Confirm current status before making a delivery commitment to a client.";
/** Printed in the Additional Services section of the Arizona and California entries (and others). */
const ENTRY_NATIONAL =
  "Available nationally regardless of state: Virtual Office and commercial business address, mail receipt / scanning / forwarding, Instant Bank Account (Relay Financial and Lili), business insurance (Next Insurance), business financing referral (Lendio), and Corporate Transparency Act / BOI compliance.";
const ENTRY_VARYING =
  "State-varying services include DBA / Trade Name, Foreign Registration (filing, renewal, and cancellation), Dissolution (delinquent and non-delinquent) and Reinstatement, Convert LLC to Close LLC, Corporate Binder and Seal, and Registered Agent Switch.";
/** Arizona, Annual Report and Renewal Filing (p. 9). */
const AZ_NO_RENEWAL =
  "Our renewal engine classifies it as a no-filing jurisdiction, so renewal reminders are suppressed and no renewal filing is sold.";
/** Wyoming, State-Specific Requirements (p. 106). */
const WY_RESTRICTED =
  "Products restricted to Wyoming: Instant Formation ($249), Custom Operating Agreement ($200), DBA Cancellation, DBA Reassignment ($100, includes the $25 state filing), and Convert LLC to Close LLC.";

// ── Evidence helpers ─────────────────────────────────────────────────────────

const notice = (noticeKey: string, quote: string, term: string): SharedEvidence => ({
  sourceId: SOURCE,
  location: { kind: "source_notice", noticeKey },
  quote,
  term,
});
const inEntry = (code: "az" | "ca" | "wy", sectionKey: string, quote: string, term: string): SharedEvidence => ({
  sourceId: SOURCE,
  location: { kind: "article_section", articleId: `llc-${code}-state-services`, sectionKey },
  quote,
  term,
});
/** The in-entry national / state-varying sentences, cited from both entries that print them in the pilot. */
const entryNational = (term: string) => [
  inEntry("az", "additional_services_available", ENTRY_NATIONAL, term),
  inEntry("ca", "additional_services_available", ENTRY_NATIONAL, term),
];
const entryVarying = (term: string) => [
  inEntry("az", "additional_services_available", ENTRY_VARYING, term),
  inEntry("ca", "additional_services_available", ENTRY_VARYING, term),
];
const flat = (term: string) => notice("what_varies_by_state", P3_FLAT, term);
const vary = (term: string) => notice("what_varies_by_state", P3_VARY, term);

function rule(
  serviceKey: ServiceKey,
  availability: SharedAvailability,
  evidence: SharedEvidence[],
  topics: KnowledgeTopic[],
  opts: { jurisdictions?: JurisdictionCode[]; caveats?: SharedEvidence[]; mappingNote?: string; termsVaryByState?: boolean } = {},
): KnowledgeSharedService {
  const scope = opts.jurisdictions ? "jurisdictions" : "national";
  const where = opts.jurisdictions ? opts.jurisdictions.join("-").toLowerCase() : "national";
  return {
    id: `llc-shared:${serviceKey}:${where}-${availability.replace(/_/g, "-")}`,
    entityType: "llc",
    serviceKey,
    scope,
    jurisdictions: opts.jurisdictions ?? null,
    availability,
    termsVaryByState: opts.termsVaryByState ?? false,
    topics,
    evidence,
    caveats: opts.caveats ?? [],
    mappingNote: opts.mappingNote ?? null,
  };
}

// ── Shared services ──────────────────────────────────────────────────────────

export const LLC_SHARED_SERVICES: KnowledgeSharedService[] = [
  // Offered nationally — p. 3.
  rule("llc_formation", "offered", [notice("what_varies_by_state", P3_FORMATION, "LLC formation")], ["formation"], {
    termsVaryByState: true,
    mappingNote: "Selectable everywhere; the source lists formation filing among the services that vary by state (fulfillment and tiers are per entry).",
  }),
  rule("ein", "offered", [flat("EIN")], ["ein"]),
  rule("s_corp_election", "offered", [flat("S-corp and other tax elections")], ["tax_election"]),
  rule("tax_classification_change", "offered", [flat("S-corp and other tax elections")], ["tax_election"], {
    mappingNote: "\"Other tax elections\": every entry lists the Form 8832 change of tax classification under its EIN and Tax Elections section.",
  }),
  rule("apostille", "offered", [flat("apostille")], ["apostille"]),
  rule("operating_agreement_update", "offered", [flat("operating agreements")], ["operating_agreement"], {
    mappingNote: "\"Operating agreements\" → the separately sold Updated Operating Agreement. Custom Operating Agreement is restricted to Wyoming by its own record.",
  }),
  rule("annual_meeting_minutes", "offered", [flat("the governance document library")], ["governance_documents"], {
    mappingNote: "Governance document (minutes). Agreement documents — NDA, contractor, digital asset, assignment of interest — are not mapped to the governance library.",
  }),
  rule("meeting_minutes_resolutions", "offered", [flat("the governance document library")], ["governance_documents"], {
    mappingNote: "Governance document (minutes and resolutions).",
  }),
  rule("certificate_of_incumbency", "offered", [flat("the governance document library")], ["governance_documents"], {
    mappingNote: "Governance document.",
  }),
  rule("membership_change", "offered", [flat("the governance document library")], ["membership_changes"], {
    mappingNote: "Governance document (membership change resolutions).",
  }),
  rule("instant_bank_account", "offered", [flat("banking"), ...entryNational("Instant Bank Account (Relay Financial and Lili)")], ["banking"], {
    mappingNote: "\"Banking\" (p. 3) is the Instant Bank Account product named in the entries' national list.",
  }),
  // Contested: p. 3 says flat nationally; the entries list it as state-varying.
  rule("corporate_binder_seal", "offered", [flat("the corporate binder")], ["corporate_binder"]),

  // Offered nationally — the entries' "Available nationally regardless of state" sentence.
  rule("virtual_office", "offered", entryNational("Virtual Office and commercial business address"), ["virtual_office"]),
  rule("mail_forwarding", "offered", entryNational("mail receipt / scanning / forwarding"), ["mail_forwarding"]),
  rule("business_insurance", "offered", entryNational("business insurance (Next Insurance)"), ["business_insurance"]),
  rule("business_financing_referral", "offered", entryNational("business financing referral (Lendio)"), ["business_financing"]),
  rule("boi_compliance", "offered", entryNational("Corporate Transparency Act / BOI compliance"), ["boi_compliance"], {
    caveats: [notice("boi_delivery_risk", P3_BOI_RISK, "Corporate Transparency Act and BOI compliance")],
  }),

  // Not a product anywhere — p. 3.
  rule("trademark_registration", "not_offered", [notice("services_not_provided", P3_TRADEMARK, "Trademark registration")], ["trademark"]),
  rule(
    "business_license_services",
    "not_offered",
    [notice("services_not_provided", P3_LICENSE, "Standalone business license research, application, or renewal")],
    ["business_license"],
    { caveats: [notice("services_not_provided", P3_LICENSE, "business licenses appear only as pass-through companion fees")] },
  ),
  rule("tax_preparation_filing", "not_offered", [notice("services_not_provided", P3_TAX, "Tax preparation and tax filing")], ["tax_preparation"]),

  // Varies by state — no national default; only the entry can say.
  rule("registered_agent", "varies_by_state", [vary("registered agent")], ["registered_agent"]),
  rule("annual_report_filing", "varies_by_state", [vary("annual report and renewal filing")], ["annual_report", "renewal"]),
  rule("article_amendment", "varies_by_state", [vary("amendments")], ["amendment"]),
  rule("sos_name_change", "varies_by_state", [vary("amendments")], ["name_change"], {
    mappingNote: "Name Change is part of the entries' Amendments and Secretary of State Filings section.",
  }),
  rule("sos_address_change", "varies_by_state", [vary("amendments")], ["address_change"], {
    mappingNote: "Address Change is part of the entries' Amendments and Secretary of State Filings section.",
  }),
  rule("certificate_of_good_standing", "varies_by_state", [vary("certificates and certified copies")], ["good_standing"]),
  rule("certified_copies", "varies_by_state", [vary("certificates and certified copies")], ["certified_copy"]),
  rule("dba", "varies_by_state", [vary("DBA"), ...entryVarying("DBA / Trade Name")], ["dba"]),
  rule("foreign_registration", "varies_by_state", [vary("foreign registration"), ...entryVarying("Foreign Registration (filing, renewal, and cancellation)")], ["foreign_registration"]),
  rule("dissolution", "varies_by_state", [vary("dissolution"), ...entryVarying("Dissolution (delinquent and non-delinquent)")], ["dissolution"]),
  rule("reinstatement", "varies_by_state", entryVarying("Reinstatement"), ["reinstatement"]),
  rule("convert_llc_to_close_llc", "varies_by_state", [vary("conversions"), ...entryVarying("Convert LLC to Close LLC")], ["conversion"]),
  rule("convert_llc_to_corporation", "varies_by_state", [vary("conversions")], ["conversion"]),
  rule("registered_agent_switch", "varies_by_state", entryVarying("Registered Agent Switch"), ["registered_agent"]),
  // Contested: listed as state-varying by the entries, flat-national by p. 3.
  rule("corporate_binder_seal", "varies_by_state", entryVarying("Corporate Binder and Seal"), ["corporate_binder"]),

  // Jurisdiction-specific exception — Arizona entry, Annual Report and Renewal Filing.
  rule(
    "annual_report_filing",
    "not_offered",
    [inEntry("az", "annual_report_and_renewal_filing", AZ_NO_RENEWAL, "no renewal filing is sold")],
    ["annual_report", "renewal"],
    { jurisdictions: ["AZ"] },
  ),

  // Offered only in Wyoming — Wyoming entry.
  ...(
    [
      ["instant_formation", "Instant Formation ($249)", ["formation"]],
      ["custom_operating_agreement", "Custom Operating Agreement ($200)", ["operating_agreement"]],
      ["dba_cancellation", "DBA Cancellation", ["dba"]],
      ["dba_reassignment", "DBA Reassignment", ["dba"]],
      ["convert_llc_to_close_llc", "Convert LLC to Close LLC", ["conversion"]],
    ] as [ServiceKey, string, KnowledgeTopic[]][]
  ).map(([key, term, topics]) =>
    rule(key, "exclusive", [inEntry("wy", "state_specific_requirements", WY_RESTRICTED, term)], topics, { jurisdictions: ["WY"] }),
  ),
];

// ── Source discrepancies (unresolved) ────────────────────────────────────────

export const LLC_SOURCE_DISCREPANCIES: KnowledgeSourceDiscrepancy[] = [
  {
    id: "llc-discrepancy:corporate-binder-scope",
    entityType: "llc",
    serviceKeys: ["corporate_binder_seal"],
    question: "Is the corporate binder priced flat nationally (Scope and caveats) or a state-varying service (the entries' Additional Services section)?",
    effect: "blocks_inheritance",
    affects: { allExcept: [] },
    claims: [flat("the corporate binder"), ...entryVarying("Corporate Binder and Seal")],
    resolution: null,
  },
  {
    id: "llc-discrepancy:convert-llc-to-close-llc-availability",
    entityType: "llc",
    serviceKeys: ["convert_llc_to_close_llc"],
    question: "Is Convert LLC to Close LLC available outside Wyoming? Other entries list it among their state-varying services; the Wyoming entry says it is restricted to Wyoming.",
    effect: "disputes_availability",
    affects: { allExcept: ["WY"] },
    claims: [
      ...entryVarying("Convert LLC to Close LLC"),
      inEntry("wy", "state_specific_requirements", WY_RESTRICTED, "Convert LLC to Close LLC"),
    ],
    resolution: null,
  },
];
