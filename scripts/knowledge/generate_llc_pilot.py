#!/usr/bin/env python3
"""Phase 8 — generate the LLC pilot Knowledge Base content from the source PDF.

Usage (from the repository root; needs poppler's `pdftotext`, tested with 24.02.0):

    python3 scripts/knowledge/generate_llc_pilot.py /path/to/LLC-Formation-Services-by-State.pdf

Writes:
    artifacts/api-server/src/knowledge/content/llcPilot.ts   (the five articles)
    artifacts/api-server/src/knowledge/content/llcSource.ts  (source provenance + notices)
    artifacts/api-server/test/fixtures/llcPilotSourceExtract.ts (raw extract for the fidelity test)

Section text is copied verbatim (pdftotext -raw; printed line breaks joined
with one space; a line-final hyphen before a lower-case letter joins the word).
Only the classification and tags in STATES/COMMON below are authored, and
validate.ts checks each of them against the text. The PDF itself is NOT in the
repository (confidential internal reference).
"""
import hashlib, json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PDF = sys.argv[1] if len(sys.argv) > 1 else "LLC-Formation-Services-by-State.pdf"
PILOT = {"AZ": ("Arizona", [9, 10]), "CA": ("California", [13, 14]), "DE": ("Delaware", [19, 20]),
         "FL": ("Florida", [23, 24]), "WY": ("Wyoming", [105, 106])}
HEADING = re.compile(r"^[A-Z][A-Z \-—/,&]+[A-Z]$")

def page_lines(p):
    out = subprocess.run(["pdftotext", "-raw", "-f", str(p), "-l", str(p), PDF, "-"], capture_output=True, text=True, check=True).stdout
    return [l.rstrip() for l in out.replace("\f", "").split("\n") if l.strip()]

def join(lines):
    s = ""
    for l in lines:
        if not s: s = l
        elif s.endswith("-") and l[:1].islower(): s += l
        else: s += " " + l
    return s

def parse(code):
    name, pages = PILOT[code]
    raw = {p: page_lines(p) for p in pages}
    first = raw[pages[0]][0]
    assert first == f"{name} {code}", first
    sections, cur = [], None
    for p in pages:
        lines = raw[p][1:] if p == pages[0] else raw[p]
        for l in lines:
            if HEADING.match(l) and len(l) > 3:
                cur = {"heading": l, "lines": [], "pages": [p]}
                sections.append(cur)
            else:
                assert cur is not None, l
                cur["lines"].append(l)
                if p not in cur["pages"]: cur["pages"].append(p)
    for s in sections: s["content"] = join(s.pop("lines"))
    return {"code": code, "name": name, "pages": pages, "header": first, "raw": raw, "sections": sections}


"""Generate the Phase 8 source-controlled Knowledge Base content from the PDF.

Section text is copied verbatim by extract.py; only the classification and
tags below are authored, and validate.ts checks each against the text.
"""

SHA = hashlib.sha256(open(PDF, "rb").read()).hexdigest()
TS_DATE = "2026-09-25T00:00:00.000Z"
SOURCE_ID = "llc-formation-services-by-state-2026-09-10"

TEMPLATE = [
 ("FORMATION FILING", "formation_filing", "Formation Filing"),
 ("REGISTERED AGENT", "registered_agent", "Registered Agent"),
 ("ANNUAL REPORT AND RENEWAL FILING", "annual_report_and_renewal_filing", "Annual Report and Renewal Filing"),
 ("AMENDMENTS AND SECRETARY OF STATE FILINGS", "amendments_and_sos_filings", "Amendments and Secretary of State Filings"),
 ("CERTIFICATES AND CERTIFIED COPIES", "certificates_and_certified_copies", "Certificates and Certified Copies"),
 ("EIN AND TAX ELECTIONS", "ein_and_tax_elections", "EIN and Tax Elections"),
 ("FORMATION DOCUMENTS INCLUDED", "formation_documents_included", "Formation Documents Included"),
 ("ADDITIONAL SERVICES AVAILABLE", "additional_services_available", "Additional Services Available"),
 ("STATE-SPECIFIC REQUIREMENTS", "state_specific_requirements", "State-Specific Requirements"),
]

# Topics / services shared by the sections whose text is identical in all five entries.
COMMON = {
 "registered_agent": (["registered_agent"], ["registered_agent", "registered_agent_switch"]),
 "amendments_and_sos_filings": (["amendment", "name_change", "address_change"], ["article_amendment", "sos_name_change", "sos_address_change"]),
 "certificates_and_certified_copies": (["good_standing", "certified_copy", "apostille"], ["certificate_of_good_standing", "certified_copies", "apostille"]),
 "ein_and_tax_elections": (["ein", "tax_election", "name_change", "address_change"],
   ["ein", "foreign_ein", "s_corp_election", "tax_classification_change", "irs_address_update", "irs_responsible_party_update", "irs_name_change"]),
 "formation_documents_included": (["formation", "operating_agreement", "governance_documents", "membership_changes"],
   ["operating_agreement_update", "annual_meeting_minutes", "meeting_minutes_resolutions", "certificate_of_incumbency", "assignment_of_interest", "membership_change", "nda", "independent_contractor_agreement", "digital_asset_assignment"]),
}
BASELINE_ADDONS = (["dba", "foreign_registration", "dissolution", "reinstatement", "conversion", "corporate_binder", "registered_agent",
                    "virtual_office", "mail_forwarding", "banking", "business_insurance", "business_financing", "boi_compliance"],
                   ["dba", "foreign_registration", "dissolution", "reinstatement", "convert_llc_to_close_llc", "corporate_binder_seal",
                    "registered_agent_switch", "virtual_office", "mail_forwarding", "instant_bank_account", "business_insurance",
                    "business_financing_referral", "boi_compliance"])

STATES = {
 "AZ": {
  "contents": True,
  "per_section": {
   "formation_filing": (["formation"], ["llc_formation"]),
   "annual_report_and_renewal_filing": (["annual_report", "renewal"], []),
   "additional_services_available": BASELINE_ADDONS,
   "state_specific_requirements": (["annual_report"], []),
  },
  "highlighted": {"OPEN RESEARCH ITEM — PUBLICATION": dict(key="open_research_item_publication", label="Open Research Item — Publication",
      flag="open_research_item", disclosure=None, verification="unverified", category="open_research_item", topics=["publication"], services=[])},
  "profile": {
   "formationFulfillment": ("manual_case", "formation_filing", "Fulfillment: manual Salesforce case worked by an operations specialist (no filing automation in this state)."),
   "registeredAgent": ("vendor_network", "registered_agent", "Provided through the RAI vendor network"),
   "renewalCadence": ("no_filing", "annual_report_and_renewal_filing", "No annual or biennial report is required in this state."),
   "renewalDueDate": (None, "annual_report_and_renewal_filing", "Our renewal engine classifies it as a no-filing jurisdiction, so renewal reminders are suppressed and no renewal filing is sold."),
   "renewalFulfillment": ("not_offered", "annual_report_and_renewal_filing", "no renewal filing is sold"),
   "addOnServiceCount": (30, "additional_services_available", "30 LLC add-on services are available in this jurisdiction."),
  },
 },
 "CA": {
  "contents": True,
  "per_section": {
   "formation_filing": (["formation"], ["llc_formation"]),
   "annual_report_and_renewal_filing": (["annual_report", "renewal"], ["annual_report_filing"]),
   "additional_services_available": BASELINE_ADDONS,
   "state_specific_requirements": (["annual_report", "formation"], []),
  },
  "highlighted": {"FRANCHISE TAX — CLIENT DISCLOSURE REQUIRED": dict(key="franchise_tax", label="Franchise Tax — Client Disclosure Required",
      flag="client_disclosure", disclosure="required", verification="documented", category="franchise_tax_annual_tax_or_annual_fee", topics=["franchise_tax"], services=[])},
  "profile": {
   "formationFulfillment": ("manual_case", "formation_filing", "Fulfillment: manual Salesforce case worked by an operations specialist (no filing automation in this state)."),
   "registeredAgent": ("vendor_network", "registered_agent", "Provided through the RAI vendor network"),
   "renewalCadence": ("biennial", "annual_report_and_renewal_filing", "Cadence: Biennial."),
   "renewalDueDate": ("First day of the formation-anniversary month", "annual_report_and_renewal_filing", "Due date computed by our renewal engine: First day of the formation-anniversary month."),
   "renewalFulfillment": ("manual", "annual_report_and_renewal_filing", "Fulfillment: manual Salesforce ticket — renewal filing is not automated in this state."),
   "addOnServiceCount": (30, "additional_services_available", "30 LLC add-on services are available in this jurisdiction."),
  },
 },
 "DE": {
  "contents": True,
  "per_section": {
   "formation_filing": (["formation"], ["llc_formation"]),
   "annual_report_and_renewal_filing": (["annual_report", "renewal"], ["annual_report_filing"]),
   "additional_services_available": (["conversion"], ["convert_llc_to_corporation"]),
   "state_specific_requirements": ([], []),
  },
  "highlighted": {"ANNUAL TAX": dict(key="annual_tax", label="Annual Tax",
      flag="state_requirement", disclosure=None, verification="documented", category="franchise_tax_annual_tax_or_annual_fee", topics=["annual_tax", "renewal"], services=[])},
  "profile": {
   "formationFulfillment": ("vendor_api", "formation_filing", "Fulfillment: filed through the RAI vendor API as an automated hand-off rather than a manual Salesforce case."),
   "registeredAgent": ("vendor_network", "registered_agent", "Provided through the RAI vendor network"),
   "renewalCadence": ("annual", "annual_report_and_renewal_filing", "Cadence: Annual."),
   "renewalDueDate": ("June 1", "annual_report_and_renewal_filing", "Due date computed by our renewal engine: June 1."),
   "renewalFulfillment": ("automated", "annual_report_and_renewal_filing", "Renewal filing is AUTOMATED for LLCs and Close LLCs."),
   "addOnServiceCount": (31, "additional_services_available", "31 LLC add-on services are available in this jurisdiction"),
  },
 },
 "FL": {
  "contents": True,
  "per_section": {
   "formation_filing": (["formation"], ["llc_formation"]),
   "annual_report_and_renewal_filing": (["annual_report", "renewal"], ["annual_report_filing"]),
   "additional_services_available": (["conversion", "dba"], ["convert_llc_to_corporation", "dba"]),
   "state_specific_requirements": ([], []),
  },
  "highlighted": {"FEES AND LATE PENALTY — CLIENT DISCLOSURE RECOMMENDED": dict(key="fees_and_late_penalty", label="Fees and Late Penalty — Client Disclosure Recommended",
      flag="client_disclosure", disclosure="recommended", verification="documented", category="unlisted",
      topics=["formation", "annual_report", "late_penalty", "dissolution", "reinstatement"], services=[])},
  "profile": {
   "formationFulfillment": ("automated_in_house", "formation_filing", "Fulfillment: in-house automated filing via our Puppeteer worker — no manual Salesforce case is created."),
   "registeredAgent": ("in_house", "registered_agent", "Provided in-house by Cloud Peak Law"),
   "renewalCadence": ("annual", "annual_report_and_renewal_filing", "Cadence: Annual."),
   "renewalDueDate": ("May 1", "annual_report_and_renewal_filing", "Due date computed by our renewal engine: May 1."),
   "renewalFulfillment": ("automated", "annual_report_and_renewal_filing", "Renewal filing is AUTOMATED for LLCs and Close LLCs."),
   "addOnServiceCount": (32, "additional_services_available", "32 LLC add-on services are available"),
  },
 },
 "WY": {
  "contents": False,
  "per_section": {
   "formation_filing": (["formation"], ["llc_formation", "instant_formation"]),
   "annual_report_and_renewal_filing": (["annual_report", "renewal"], ["annual_report_filing"]),
   "additional_services_available": (["conversion", "operating_agreement", "formation", "dba"],
      ["convert_llc_to_corporation", "custom_operating_agreement", "instant_formation", "dba"]),
   "state_specific_requirements": (["formation", "operating_agreement", "dba", "conversion"],
      ["instant_formation", "custom_operating_agreement", "dba_cancellation", "dba_reassignment", "convert_llc_to_close_llc"]),
  },
  "highlighted": {},
  "profile": {
   "formationFulfillment": ("automated_in_house", "formation_filing", "Fulfillment: in-house automated filing via our Puppeteer worker — no manual Salesforce case is created."),
   "registeredAgent": ("in_house", "registered_agent", "Provided in-house by Cloud Peak Law"),
   "renewalCadence": ("annual", "annual_report_and_renewal_filing", "Cadence: Annual."),
   "renewalDueDate": ("First day of the formation-anniversary month", "annual_report_and_renewal_filing", "Due date computed by our renewal engine: First day of the formation-anniversary month."),
   "renewalFulfillment": ("automated", "annual_report_and_renewal_filing", "Renewal filing is AUTOMATED for all entity types"),
   "addOnServiceCount": (34, "additional_services_available", "34 LLC add-on services are available"),
  },
 },
}

def slugify(t):
    import re
    t = t.lower().replace("&", " and ")
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", t))

def build_article(code):
    d = parse(code); meta = STATES[code]; name = d["name"]
    title = f"{name} — LLC Services & Requirements"
    art_id = f"llc-{code.lower()}-state-services"
    sections = []
    tmpl = {h: (k, l) for h, k, l in TEMPLATE}
    for i, s in enumerate(d["sections"]):
        h = s["heading"]
        if i < 9:
            assert h == TEMPLATE[i][0], (code, h)
            key, label = tmpl[h]
            topics, services = meta["per_section"].get(key) or COMMON[key]
            kind = "state_specific" if key == "state_specific_requirements" else "standard"
            na = kind == "state_specific" and s["content"].startswith("N/A")
            flag = "none" if kind == "standard" or na else "state_requirement"
            sec = dict(key=key, label=label, sourceHeading=h, order=i + 1, kind=kind, flag=flag, clientDisclosure=None,
                       verification="documented", highlightCategory=None, notApplicable=na, content=s["content"],
                       sourcePages=s["pages"], topics=topics, serviceKeys=services)
        else:
            m = meta["highlighted"][h]
            sec = dict(key=m["key"], label=m["label"], sourceHeading=h, order=i + 1, kind="highlighted", flag=m["flag"],
                       clientDisclosure=m["disclosure"], verification=m["verification"], highlightCategory=m["category"],
                       notApplicable=False, content=s["content"], sourcePages=s["pages"], topics=m["topics"], serviceKeys=m["services"])
        sections.append(sec)
    assert len(sections) == 9 + len(meta["highlighted"]), code
    content_by_key = {s["key"]: s["content"] for s in sections}
    profile = {}
    for k, (value, skey, quote) in meta["profile"].items():
        assert quote in content_by_key[skey], (code, k, quote)
        profile[k] = {"value": value, "evidence": {"sectionKey": skey, "quote": quote}}
    return {
        "id": art_id, "slug": slugify(title), "title": title, "entityType": "llc", "jurisdictionCode": code,
        "jurisdictionName": name, "articleType": "state_services", "status": "published", "audience": "internal",
        "internalOnly": True, "counselReviewed": False, "lastReviewedAt": None, "createdAt": TS_DATE, "updatedAt": TS_DATE,
        "provenance": {"sourceId": SOURCE_ID, "pages": d["pages"], "sourceEntryHeader": d["header"], "contentsMarksHighlighted": meta["contents"]},
        "aliases": [name, code, f"{name} LLC", f"{code} LLC"],
        "serviceProfile": profile, "sections": sections,
    }

def ts(v, ind=0):
    return json.dumps(v, ensure_ascii=False, indent=2)

def notices():
    p1, p2, p3 = page_lines(1), page_lines(2), page_lines(3)
    def para(lines, start, end_marker=None):
        i = lines.index(start) if isinstance(start, str) else start
        out = []
        for l in lines[i:]:
            if end_marker and l.startswith(end_marker) and out: break
            out.append(l)
        return join(out)
    def between(lines, head, nxt):
        i = lines.index(head) + 1
        j = lines.index(nxt) if nxt else len(lines)
        return join(lines[i:j])
    n = []
    n.append(dict(key="confidentiality", label="CONFIDENTIAL — INTERNAL REFERENCE", text=join(p1[p1.index("CONFIDENTIAL — INTERNAL REFERENCE") + 1:]), page=1))
    hi = p2.index("HIGHLIGHTED SECTIONS — ADDED ONLY WHERE A STATE REQUIRES ONE")
    two = next(i for i, l in enumerate(p2) if l.startswith("Two of those titles"))
    n.append(dict(key="state_specific_na", label="STATE-SPECIFIC REQUIREMENTS — ALSO PRESENT FOR EVERY STATE",
                  text=between(p2, "STATE-SPECIFIC REQUIREMENTS — ALSO PRESENT FOR EVERY STATE", "HIGHLIGHTED SECTIONS — ADDED ONLY WHERE A STATE REQUIRES ONE"), page=2))
    n.append(dict(key="highlighted_sections", label="HIGHLIGHTED SECTIONS — ADDED ONLY WHERE A STATE REQUIRES ONE", text=join(p2[hi + 1:two]), page=2))
    n.append(dict(key="service_gaps_and_research_items", label="HIGHLIGHTED SECTIONS — ADDED ONLY WHERE A STATE REQUIRES ONE", text=join(p2[two:]), page=2))
    heads3 = ["WHAT VARIES BY STATE, AND WHAT DOES NOT", "FULFILLMENT IS MOSTLY MANUAL", "WHERE THE STATE-REQUIREMENT DATA COMES FROM",
              "STATE FILING FEES ARE NOT IN THIS DOCUMENT", "SERVICES WE DO NOT PROVIDE", "ONE DELIVERY RISK WORTH KNOWING"]
    keys3 = ["what_varies_by_state", "fulfillment_mostly_manual", "state_requirement_data_origin", "state_filing_fees_not_included",
             "services_not_provided", "boi_delivery_risk"]
    for k, h, nx in zip(keys3, heads3, heads3[1:] + [None]):
        n.append(dict(key=k, label=h, text=between(p3, h, nx), page=3))
    return n

HEADER = "/**\n * GENERATED from {src} (sha256 {sha})\n * by scripts/knowledge/generate_llc_pilot.py (pdftotext -raw, lines joined\n * with one space). Section text is VERBATIM — do not edit it by hand; fix the\n * extraction and regenerate. Classification and tags are authored and are\n * checked against the text by validate.ts.\n */\n"

if __name__ == "__main__":
    arts = [build_article(c) for c in PILOT]
    out = HEADER.format(src="LLC-Formation-Services-by-State.pdf", sha=SHA)
    out += 'import type { KnowledgeArticleInput } from "../model.js";\n\n'
    out += "/** The five Phase 8 LLC pilot articles: Arizona, California, Delaware, Florida, Wyoming. */\n"
    out += "export const LLC_PILOT_ARTICLES: KnowledgeArticleInput[] = " + ts(arts) + ";\n"
    open(ROOT + "/artifacts/api-server/src/knowledge/content/llcPilot.ts", "w").write(out)

    src = dict(id=SOURCE_ID, fileName="LLC-Formation-Services-by-State.pdf", title="LLC Formation Services by State",
               publisher="Cloud Peak Law — Company Sage", preparedDate="2026-09-10", entityType="llc",
               sourceType="internal_reference_document", coverage="All 50 states and the District of Columbia",
               confidentiality="CONFIDENTIAL — INTERNAL REFERENCE", internalOnly=True, counselReviewed=False,
               sha256=SHA, contentPages=106, filePages=316, notices=notices())
    s = HEADER.format(src="LLC-Formation-Services-by-State.pdf", sha=SHA).replace("Section text", "Notice text")
    s += 'import type { KnowledgeSource } from "../model.js";\n\n'
    s += "/** The LLC state-by-state reference: provenance and its own framing notices. */\n"
    s += "export const LLC_SOURCE: KnowledgeSource = " + ts(src) + ";\n"
    open(ROOT + "/artifacts/api-server/src/knowledge/content/llcSource.ts", "w").write(s)

    # Independent raw extract for the fidelity test: the pdftotext lines of every pilot page, untouched.
    pages = []
    for c in PILOT:
        for p in PILOT[c][1]:
            pages.append({"jurisdictionCode": c, "page": p, "lines": page_lines(p)})
    f = "/**\n * Raw `pdftotext -raw` lines of the five pilot entries of\n * LLC-Formation-Services-by-State.pdf (sha256 " + SHA + "),\n * pdftotext 24.02.0. Test fixture only: the fidelity test re-parses these\n * lines on its own and compares them with the stored articles.\n */\n"
    f += "export const LLC_PILOT_SOURCE_SHA256 = " + json.dumps(SHA) + ";\n\n"
    f += "export const LLC_PILOT_SOURCE_PAGES: { jurisdictionCode: string; page: number; lines: string[] }[] = " + ts(pages) + ";\n"
    import os; os.makedirs(ROOT + "/artifacts/api-server/test/fixtures", exist_ok=True)
    open(ROOT + "/artifacts/api-server/test/fixtures/llcPilotSourceExtract.ts", "w").write(f)
    print("ok", [a["id"] for a in arts])
