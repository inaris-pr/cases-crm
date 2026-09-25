/**
 * GENERATED from LLC-Formation-Services-by-State.pdf (sha256 308c346ea76cfa41ec7f661d8df019513f18344b1105c0185535a9b03c241b8d)
 * by scripts/knowledge/generate_llc_pilot.py (pdftotext -raw, lines joined
 * with one space). Section text is VERBATIM — do not edit it by hand; fix the
 * extraction and regenerate. Classification and tags are authored and are
 * checked against the text by validate.ts.
 */
import type { KnowledgeArticleInput } from "../model.js";

/** The five Phase 8 LLC pilot articles: Arizona, California, Delaware, Florida, Wyoming. */
export const LLC_PILOT_ARTICLES: KnowledgeArticleInput[] = [
  {
    "id": "llc-az-state-services",
    "slug": "arizona-llc-services-and-requirements",
    "title": "Arizona — LLC Services & Requirements",
    "entityType": "llc",
    "jurisdictionCode": "AZ",
    "jurisdictionName": "Arizona",
    "articleType": "state_services",
    "status": "published",
    "audience": "internal",
    "internalOnly": true,
    "counselReviewed": false,
    "lastReviewedAt": null,
    "createdAt": "2026-09-25T00:00:00.000Z",
    "updatedAt": "2026-09-25T00:00:00.000Z",
    "provenance": {
      "sourceId": "llc-formation-services-by-state-2026-09-10",
      "pages": [
        9,
        10
      ],
      "sourceEntryHeader": "Arizona AZ",
      "contentsMarksHighlighted": true
    },
    "aliases": [
      "Arizona",
      "AZ",
      "Arizona LLC",
      "AZ LLC"
    ],
    "serviceProfile": {
      "formationFulfillment": {
        "value": "manual_case",
        "evidence": {
          "sectionKey": "formation_filing",
          "quote": "Fulfillment: manual Salesforce case worked by an operations specialist (no filing automation in this state)."
        }
      },
      "registeredAgent": {
        "value": "vendor_network",
        "evidence": {
          "sectionKey": "registered_agent",
          "quote": "Provided through the RAI vendor network"
        }
      },
      "renewalCadence": {
        "value": "no_filing",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "No annual or biennial report is required in this state."
        }
      },
      "renewalDueDate": {
        "value": null,
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Our renewal engine classifies it as a no-filing jurisdiction, so renewal reminders are suppressed and no renewal filing is sold."
        }
      },
      "renewalFulfillment": {
        "value": "not_offered",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "no renewal filing is sold"
        }
      },
      "addOnServiceCount": {
        "value": 30,
        "evidence": {
          "sectionKey": "additional_services_available",
          "quote": "30 LLC add-on services are available in this jurisdiction."
        }
      }
    },
    "sections": [
      {
        "key": "formation_filing",
        "label": "Formation Filing",
        "sourceHeading": "FORMATION FILING",
        "order": 1,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "LLC formation is available and selectable at intake. Fulfillment: manual Salesforce case worked by an operations specialist (no filing automation in this state). Formation tiers: $99 / $199 / $399.",
        "sourcePages": [
          9
        ],
        "topics": [
          "formation"
        ],
        "serviceKeys": [
          "llc_formation"
        ]
      },
      {
        "key": "registered_agent",
        "label": "Registered Agent",
        "sourceHeading": "REGISTERED AGENT",
        "order": 2,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Provided through the RAI vendor network, with a Cloud Peak Law registered agent address on file for this jurisdiction. Includes receipt of service of process and official state mail, scanning, and delivery to the client portal. Registered Agent Switch service is available.",
        "sourcePages": [
          9
        ],
        "topics": [
          "registered_agent"
        ],
        "serviceKeys": [
          "registered_agent",
          "registered_agent_switch"
        ]
      },
      {
        "key": "annual_report_and_renewal_filing",
        "label": "Annual Report and Renewal Filing",
        "sourceHeading": "ANNUAL REPORT AND RENEWAL FILING",
        "order": 3,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "No annual or biennial report is required in this state. Our renewal engine classifies it as a no-filing jurisdiction, so renewal reminders are suppressed and no renewal filing is sold. The six no-filing states for LLCs are Alabama, Arizona, Missouri, New Mexico, Ohio, and South Carolina.",
        "sourcePages": [
          9
        ],
        "topics": [
          "annual_report",
          "renewal"
        ],
        "serviceKeys": []
      },
      {
        "key": "amendments_and_sos_filings",
        "label": "Amendments and Secretary of State Filings",
        "sourceHeading": "AMENDMENTS AND SECRETARY OF STATE FILINGS",
        "order": 4,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Article Amendment — $100 service fee. Name Change with the Secretary of State — $100 service fee. Address Change — $100 service fee. In every case the state filing fee is billed as a separate pass-through line at checkout. Where a per-state filing fee has not yet been curated, the fee line is omitted at checkout and the amount is collected by an internal post-purchase process.",
        "sourcePages": [
          9
        ],
        "topics": [
          "amendment",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "article_amendment",
          "sos_name_change",
          "sos_address_change"
        ]
      },
      {
        "key": "certificates_and_certified_copies",
        "label": "Certificates and Certified Copies",
        "sourceHeading": "CERTIFICATES AND CERTIFIED COPIES",
        "order": 5,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Certificate of Good Standing — $35. Certified Copies of Articles of Organization — $100. Apostille (international document authentication) — $250.",
        "sourcePages": [
          9
        ],
        "topics": [
          "good_standing",
          "certified_copy",
          "apostille"
        ],
        "serviceKeys": [
          "certificate_of_good_standing",
          "certified_copies",
          "apostille"
        ]
      },
      {
        "key": "ein_and_tax_elections",
        "label": "EIN and Tax Elections",
        "sourceHeading": "EIN AND TAX ELECTIONS",
        "order": 6,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Employer Identification Number (EIN) — $75. Foreign EIN for non-US residents without an SSN or ITIN — available. S-Corp Tax Election, Form 2553 — $150. Change of tax classification to C-Corp, Partnership or Disregarded Entity, Form 8832 (LLC only) — $150. Update Business Address with the IRS, Form 8822 — $100. Update Responsible Party — $100. Update both — $100. Change Company Name on file with the IRS — $150.",
        "sourcePages": [
          9
        ],
        "topics": [
          "ein",
          "tax_election",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "ein",
          "foreign_ein",
          "s_corp_election",
          "tax_classification_change",
          "irs_address_update",
          "irs_responsible_party_update",
          "irs_name_change"
        ]
      },
      {
        "key": "formation_documents_included",
        "label": "Formation Documents Included",
        "sourceHeading": "FORMATION DOCUMENTS INCLUDED",
        "order": 7,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Generated at formation: Operating Agreement, Organizational Minutes, and Resolution to Open a Bank Account. Available separately: Updated Operating Agreement — $50. Custom Annual Meeting Minutes for LLCs — $50. Special, Contribution, and Distribution Meeting Minutes and Resolutions — $25 each. Certificate of Incumbency, standard or custom — $100. Assignment of Interest — $100. Membership changes (new member joining, company buyout of a departing member, member-to-member buyout, appointment of a new manager, manager removal by member vote) — $100 each. Non-Disclosure Agreement — $100. Independent Contractor Agreement — $100. Digital Asset Assignment — $50.",
        "sourcePages": [
          9
        ],
        "topics": [
          "formation",
          "operating_agreement",
          "governance_documents",
          "membership_changes"
        ],
        "serviceKeys": [
          "operating_agreement_update",
          "annual_meeting_minutes",
          "meeting_minutes_resolutions",
          "certificate_of_incumbency",
          "assignment_of_interest",
          "membership_change",
          "nda",
          "independent_contractor_agreement",
          "digital_asset_assignment"
        ]
      },
      {
        "key": "additional_services_available",
        "label": "Additional Services Available",
        "sourceHeading": "ADDITIONAL SERVICES AVAILABLE",
        "order": 8,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "30 LLC add-on services are available in this jurisdiction. State-varying services include DBA / Trade Name, Foreign Registration (filing, renewal, and cancellation), Dissolution (delinquent and non-delinquent) and Reinstatement, Convert LLC to Close LLC, Corporate Binder and Seal, and Registered Agent Switch. Available nationally regardless of state: Virtual Office and commercial business address, mail receipt / scanning / forwarding, Instant Bank Account (Relay Financial and Lili), business insurance (Next Insurance), business financing referral (Lendio), and Corporate Transparency Act / BOI compliance.",
        "sourcePages": [
          9
        ],
        "topics": [
          "dba",
          "foreign_registration",
          "dissolution",
          "reinstatement",
          "conversion",
          "corporate_binder",
          "registered_agent",
          "virtual_office",
          "mail_forwarding",
          "banking",
          "business_insurance",
          "business_financing",
          "boi_compliance"
        ],
        "serviceKeys": [
          "dba",
          "foreign_registration",
          "dissolution",
          "reinstatement",
          "convert_llc_to_close_llc",
          "corporate_binder_seal",
          "registered_agent_switch",
          "virtual_office",
          "mail_forwarding",
          "instant_bank_account",
          "business_insurance",
          "business_financing_referral",
          "boi_compliance"
        ]
      },
      {
        "key": "state_specific_requirements",
        "label": "State-Specific Requirements",
        "sourceHeading": "STATE-SPECIFIC REQUIREMENTS",
        "order": 9,
        "kind": "state_specific",
        "flag": "state_requirement",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Arizona LLCs file no annual report at all. This is genuine and is correctly reflected in our renewal engine — but note that Arizona corporations DO file a $45 annual report, so corporation-oriented sources will contradict this.",
        "sourcePages": [
          10
        ],
        "topics": [
          "annual_report"
        ],
        "serviceKeys": []
      },
      {
        "key": "open_research_item_publication",
        "label": "Open Research Item — Publication",
        "sourceHeading": "OPEN RESEARCH ITEM — PUBLICATION",
        "order": 10,
        "kind": "highlighted",
        "flag": "open_research_item",
        "clientDisclosure": null,
        "verification": "unverified",
        "highlightCategory": "open_research_item",
        "notApplicable": false,
        "content": "Arizona has a newspaper publication requirement (publish after Corporation Commission approval, unless the known place of business is in Maricopa or Pima County, where the Commission's own database posting satisfies it). Our internal research covered this requirement for CORPORATIONS only, under A.R.S. §10-203. LLC applicability has not been verified in our documentation. Confirm directly with the Arizona Corporation Commission before advising a client.",
        "sourcePages": [
          10
        ],
        "topics": [
          "publication"
        ],
        "serviceKeys": []
      }
    ]
  },
  {
    "id": "llc-ca-state-services",
    "slug": "california-llc-services-and-requirements",
    "title": "California — LLC Services & Requirements",
    "entityType": "llc",
    "jurisdictionCode": "CA",
    "jurisdictionName": "California",
    "articleType": "state_services",
    "status": "published",
    "audience": "internal",
    "internalOnly": true,
    "counselReviewed": false,
    "lastReviewedAt": null,
    "createdAt": "2026-09-25T00:00:00.000Z",
    "updatedAt": "2026-09-25T00:00:00.000Z",
    "provenance": {
      "sourceId": "llc-formation-services-by-state-2026-09-10",
      "pages": [
        13,
        14
      ],
      "sourceEntryHeader": "California CA",
      "contentsMarksHighlighted": true
    },
    "aliases": [
      "California",
      "CA",
      "California LLC",
      "CA LLC"
    ],
    "serviceProfile": {
      "formationFulfillment": {
        "value": "manual_case",
        "evidence": {
          "sectionKey": "formation_filing",
          "quote": "Fulfillment: manual Salesforce case worked by an operations specialist (no filing automation in this state)."
        }
      },
      "registeredAgent": {
        "value": "vendor_network",
        "evidence": {
          "sectionKey": "registered_agent",
          "quote": "Provided through the RAI vendor network"
        }
      },
      "renewalCadence": {
        "value": "biennial",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Cadence: Biennial."
        }
      },
      "renewalDueDate": {
        "value": "First day of the formation-anniversary month",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Due date computed by our renewal engine: First day of the formation-anniversary month."
        }
      },
      "renewalFulfillment": {
        "value": "manual",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Fulfillment: manual Salesforce ticket — renewal filing is not automated in this state."
        }
      },
      "addOnServiceCount": {
        "value": 30,
        "evidence": {
          "sectionKey": "additional_services_available",
          "quote": "30 LLC add-on services are available in this jurisdiction."
        }
      }
    },
    "sections": [
      {
        "key": "formation_filing",
        "label": "Formation Filing",
        "sourceHeading": "FORMATION FILING",
        "order": 1,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "LLC formation is available and selectable at intake. Fulfillment: manual Salesforce case worked by an operations specialist (no filing automation in this state). Formation tiers: $99 / $199 / $399.",
        "sourcePages": [
          13
        ],
        "topics": [
          "formation"
        ],
        "serviceKeys": [
          "llc_formation"
        ]
      },
      {
        "key": "registered_agent",
        "label": "Registered Agent",
        "sourceHeading": "REGISTERED AGENT",
        "order": 2,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Provided through the RAI vendor network, with a Cloud Peak Law registered agent address on file for this jurisdiction. Includes receipt of service of process and official state mail, scanning, and delivery to the client portal. Registered Agent Switch service is available.",
        "sourcePages": [
          13
        ],
        "topics": [
          "registered_agent"
        ],
        "serviceKeys": [
          "registered_agent",
          "registered_agent_switch"
        ]
      },
      {
        "key": "annual_report_and_renewal_filing",
        "label": "Annual Report and Renewal Filing",
        "sourceHeading": "ANNUAL REPORT AND RENEWAL FILING",
        "order": 3,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Cadence: Biennial. Due date computed by our renewal engine: First day of the formation-anniversary month. Fulfillment: manual Salesforce ticket — renewal filing is not automated in this state.",
        "sourcePages": [
          13
        ],
        "topics": [
          "annual_report",
          "renewal"
        ],
        "serviceKeys": [
          "annual_report_filing"
        ]
      },
      {
        "key": "amendments_and_sos_filings",
        "label": "Amendments and Secretary of State Filings",
        "sourceHeading": "AMENDMENTS AND SECRETARY OF STATE FILINGS",
        "order": 4,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Article Amendment — $100 service fee. Name Change with the Secretary of State — $100 service fee. Address Change — $100 service fee. In every case the state filing fee is billed as a separate pass-through line at checkout. Where a per-state filing fee has not yet been curated, the fee line is omitted at checkout and the amount is collected by an internal post-purchase process.",
        "sourcePages": [
          13
        ],
        "topics": [
          "amendment",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "article_amendment",
          "sos_name_change",
          "sos_address_change"
        ]
      },
      {
        "key": "certificates_and_certified_copies",
        "label": "Certificates and Certified Copies",
        "sourceHeading": "CERTIFICATES AND CERTIFIED COPIES",
        "order": 5,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Certificate of Good Standing — $35. Certified Copies of Articles of Organization — $100. Apostille (international document authentication) — $250.",
        "sourcePages": [
          13
        ],
        "topics": [
          "good_standing",
          "certified_copy",
          "apostille"
        ],
        "serviceKeys": [
          "certificate_of_good_standing",
          "certified_copies",
          "apostille"
        ]
      },
      {
        "key": "ein_and_tax_elections",
        "label": "EIN and Tax Elections",
        "sourceHeading": "EIN AND TAX ELECTIONS",
        "order": 6,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Employer Identification Number (EIN) — $75. Foreign EIN for non-US residents without an SSN or ITIN — available. S-Corp Tax Election, Form 2553 — $150. Change of tax classification to C-Corp, Partnership or Disregarded Entity, Form 8832 (LLC only) — $150. Update Business Address with the IRS, Form 8822 — $100. Update Responsible Party — $100. Update both — $100. Change Company Name on file with the IRS — $150.",
        "sourcePages": [
          13
        ],
        "topics": [
          "ein",
          "tax_election",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "ein",
          "foreign_ein",
          "s_corp_election",
          "tax_classification_change",
          "irs_address_update",
          "irs_responsible_party_update",
          "irs_name_change"
        ]
      },
      {
        "key": "formation_documents_included",
        "label": "Formation Documents Included",
        "sourceHeading": "FORMATION DOCUMENTS INCLUDED",
        "order": 7,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Generated at formation: Operating Agreement, Organizational Minutes, and Resolution to Open a Bank Account. Available separately: Updated Operating Agreement — $50. Custom Annual Meeting Minutes for LLCs — $50. Special, Contribution, and Distribution Meeting Minutes and Resolutions — $25 each. Certificate of Incumbency, standard or custom — $100. Assignment of Interest — $100. Membership changes (new member joining, company buyout of a departing member, member-to-member buyout, appointment of a new manager, manager removal by member vote) — $100 each. Non-Disclosure Agreement — $100. Independent Contractor Agreement — $100. Digital Asset Assignment — $50.",
        "sourcePages": [
          13
        ],
        "topics": [
          "formation",
          "operating_agreement",
          "governance_documents",
          "membership_changes"
        ],
        "serviceKeys": [
          "operating_agreement_update",
          "annual_meeting_minutes",
          "meeting_minutes_resolutions",
          "certificate_of_incumbency",
          "assignment_of_interest",
          "membership_change",
          "nda",
          "independent_contractor_agreement",
          "digital_asset_assignment"
        ]
      },
      {
        "key": "additional_services_available",
        "label": "Additional Services Available",
        "sourceHeading": "ADDITIONAL SERVICES AVAILABLE",
        "order": 8,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "30 LLC add-on services are available in this jurisdiction. State-varying services include DBA / Trade Name, Foreign Registration (filing, renewal, and cancellation), Dissolution (delinquent and non-delinquent) and Reinstatement, Convert LLC to Close LLC, Corporate Binder and Seal, and Registered Agent Switch. Available nationally regardless of state: Virtual Office and commercial business address, mail receipt / scanning / forwarding, Instant Bank Account (Relay Financial and Lili), business insurance (Next Insurance), business financing referral (Lendio), and Corporate Transparency Act / BOI compliance.",
        "sourcePages": [
          13
        ],
        "topics": [
          "dba",
          "foreign_registration",
          "dissolution",
          "reinstatement",
          "conversion",
          "corporate_binder",
          "registered_agent",
          "virtual_office",
          "mail_forwarding",
          "banking",
          "business_insurance",
          "business_financing",
          "boi_compliance"
        ],
        "serviceKeys": [
          "dba",
          "foreign_registration",
          "dissolution",
          "reinstatement",
          "convert_llc_to_close_llc",
          "corporate_binder_seal",
          "registered_agent_switch",
          "virtual_office",
          "mail_forwarding",
          "instant_bank_account",
          "business_insurance",
          "business_financing_referral",
          "boi_compliance"
        ]
      },
      {
        "key": "state_specific_requirements",
        "label": "State-Specific Requirements",
        "sourceHeading": "STATE-SPECIFIC REQUIREMENTS",
        "order": 9,
        "kind": "state_specific",
        "flag": "state_requirement",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "The California Statement of Information is BIENNIAL for LLCs at $20. (Corporations file annually at $25 — this is the single most frequently copied LLC/corporation mix-up in third-party fee tables.) Our configured LLC formation price for California is $90.",
        "sourcePages": [
          14
        ],
        "topics": [
          "annual_report",
          "formation"
        ],
        "serviceKeys": []
      },
      {
        "key": "franchise_tax",
        "label": "Franchise Tax — Client Disclosure Required",
        "sourceHeading": "FRANCHISE TAX — CLIENT DISCLOSURE REQUIRED",
        "order": 10,
        "kind": "highlighted",
        "flag": "client_disclosure",
        "clientDisclosure": "required",
        "verification": "documented",
        "highlightCategory": "franchise_tax_annual_tax_or_annual_fee",
        "notApplicable": false,
        "content": "California imposes an $800 minimum annual franchise tax, payable to the Franchise Tax Board rather than the Secretary of State. Critically, the first-year minimum-tax exemption has EXPIRED for LLCs — it currently applies to corporations only. A California LLC therefore owes $800 in its first taxable year. This should be disclosed to the client before purchase.",
        "sourcePages": [
          14
        ],
        "topics": [
          "franchise_tax"
        ],
        "serviceKeys": []
      }
    ]
  },
  {
    "id": "llc-de-state-services",
    "slug": "delaware-llc-services-and-requirements",
    "title": "Delaware — LLC Services & Requirements",
    "entityType": "llc",
    "jurisdictionCode": "DE",
    "jurisdictionName": "Delaware",
    "articleType": "state_services",
    "status": "published",
    "audience": "internal",
    "internalOnly": true,
    "counselReviewed": false,
    "lastReviewedAt": null,
    "createdAt": "2026-09-25T00:00:00.000Z",
    "updatedAt": "2026-09-25T00:00:00.000Z",
    "provenance": {
      "sourceId": "llc-formation-services-by-state-2026-09-10",
      "pages": [
        19,
        20
      ],
      "sourceEntryHeader": "Delaware DE",
      "contentsMarksHighlighted": true
    },
    "aliases": [
      "Delaware",
      "DE",
      "Delaware LLC",
      "DE LLC"
    ],
    "serviceProfile": {
      "formationFulfillment": {
        "value": "vendor_api",
        "evidence": {
          "sectionKey": "formation_filing",
          "quote": "Fulfillment: filed through the RAI vendor API as an automated hand-off rather than a manual Salesforce case."
        }
      },
      "registeredAgent": {
        "value": "vendor_network",
        "evidence": {
          "sectionKey": "registered_agent",
          "quote": "Provided through the RAI vendor network"
        }
      },
      "renewalCadence": {
        "value": "annual",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Cadence: Annual."
        }
      },
      "renewalDueDate": {
        "value": "June 1",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Due date computed by our renewal engine: June 1."
        }
      },
      "renewalFulfillment": {
        "value": "automated",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Renewal filing is AUTOMATED for LLCs and Close LLCs."
        }
      },
      "addOnServiceCount": {
        "value": 31,
        "evidence": {
          "sectionKey": "additional_services_available",
          "quote": "31 LLC add-on services are available in this jurisdiction"
        }
      }
    },
    "sections": [
      {
        "key": "formation_filing",
        "label": "Formation Filing",
        "sourceHeading": "FORMATION FILING",
        "order": 1,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "LLC formation is available and selectable at intake. Fulfillment: filed through the RAI vendor API as an automated hand-off rather than a manual Salesforce case. Formation tiers: $99 / $199 / $399.",
        "sourcePages": [
          19
        ],
        "topics": [
          "formation"
        ],
        "serviceKeys": [
          "llc_formation"
        ]
      },
      {
        "key": "registered_agent",
        "label": "Registered Agent",
        "sourceHeading": "REGISTERED AGENT",
        "order": 2,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Provided through the RAI vendor network, with a Cloud Peak Law registered agent address on file for this jurisdiction. Includes receipt of service of process and official state mail, scanning, and delivery to the client portal. Registered Agent Switch service is available.",
        "sourcePages": [
          19
        ],
        "topics": [
          "registered_agent"
        ],
        "serviceKeys": [
          "registered_agent",
          "registered_agent_switch"
        ]
      },
      {
        "key": "annual_report_and_renewal_filing",
        "label": "Annual Report and Renewal Filing",
        "sourceHeading": "ANNUAL REPORT AND RENEWAL FILING",
        "order": 3,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Cadence: Annual. Due date computed by our renewal engine: June 1. Renewal filing is AUTOMATED for LLCs and Close LLCs.",
        "sourcePages": [
          19
        ],
        "topics": [
          "annual_report",
          "renewal"
        ],
        "serviceKeys": [
          "annual_report_filing"
        ]
      },
      {
        "key": "amendments_and_sos_filings",
        "label": "Amendments and Secretary of State Filings",
        "sourceHeading": "AMENDMENTS AND SECRETARY OF STATE FILINGS",
        "order": 4,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Article Amendment — $100 service fee. Name Change with the Secretary of State — $100 service fee. Address Change — $100 service fee. In every case the state filing fee is billed as a separate pass-through line at checkout. Where a per-state filing fee has not yet been curated, the fee line is omitted at checkout and the amount is collected by an internal post-purchase process.",
        "sourcePages": [
          19
        ],
        "topics": [
          "amendment",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "article_amendment",
          "sos_name_change",
          "sos_address_change"
        ]
      },
      {
        "key": "certificates_and_certified_copies",
        "label": "Certificates and Certified Copies",
        "sourceHeading": "CERTIFICATES AND CERTIFIED COPIES",
        "order": 5,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Certificate of Good Standing — $35. Certified Copies of Articles of Organization — $100. Apostille (international document authentication) — $250.",
        "sourcePages": [
          19
        ],
        "topics": [
          "good_standing",
          "certified_copy",
          "apostille"
        ],
        "serviceKeys": [
          "certificate_of_good_standing",
          "certified_copies",
          "apostille"
        ]
      },
      {
        "key": "ein_and_tax_elections",
        "label": "EIN and Tax Elections",
        "sourceHeading": "EIN AND TAX ELECTIONS",
        "order": 6,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Employer Identification Number (EIN) — $75. Foreign EIN for non-US residents without an SSN or ITIN — available. S-Corp Tax Election, Form 2553 — $150. Change of tax classification to C-Corp, Partnership or Disregarded Entity, Form 8832 (LLC only) — $150. Update Business Address with the IRS, Form 8822 — $100. Update Responsible Party — $100. Update both — $100. Change Company Name on file with the IRS — $150.",
        "sourcePages": [
          19
        ],
        "topics": [
          "ein",
          "tax_election",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "ein",
          "foreign_ein",
          "s_corp_election",
          "tax_classification_change",
          "irs_address_update",
          "irs_responsible_party_update",
          "irs_name_change"
        ]
      },
      {
        "key": "formation_documents_included",
        "label": "Formation Documents Included",
        "sourceHeading": "FORMATION DOCUMENTS INCLUDED",
        "order": 7,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Generated at formation: Operating Agreement, Organizational Minutes, and Resolution to Open a Bank Account. Available separately: Updated Operating Agreement — $50. Custom Annual Meeting Minutes for LLCs — $50. Special, Contribution, and Distribution Meeting Minutes and Resolutions — $25 each. Certificate of Incumbency, standard or custom — $100. Assignment of Interest — $100. Membership changes (new member joining, company buyout of a departing member, member-to-member buyout, appointment of a new manager, manager removal by member vote) — $100 each. Non-Disclosure Agreement — $100. Independent Contractor Agreement — $100. Digital Asset Assignment — $50.",
        "sourcePages": [
          19
        ],
        "topics": [
          "formation",
          "operating_agreement",
          "governance_documents",
          "membership_changes"
        ],
        "serviceKeys": [
          "operating_agreement_update",
          "annual_meeting_minutes",
          "meeting_minutes_resolutions",
          "certificate_of_incumbency",
          "assignment_of_interest",
          "membership_change",
          "nda",
          "independent_contractor_agreement",
          "digital_asset_assignment"
        ]
      },
      {
        "key": "additional_services_available",
        "label": "Additional Services Available",
        "sourceHeading": "ADDITIONAL SERVICES AVAILABLE",
        "order": 8,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "31 LLC add-on services are available in this jurisdiction — the 30-product baseline plus Convert LLC to Corporation.",
        "sourcePages": [
          19
        ],
        "topics": [
          "conversion"
        ],
        "serviceKeys": [
          "convert_llc_to_corporation"
        ]
      },
      {
        "key": "state_specific_requirements",
        "label": "State-Specific Requirements",
        "sourceHeading": "STATE-SPECIFIC REQUIREMENTS",
        "order": 9,
        "kind": "state_specific",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": true,
        "content": "N/A — no LLC-specific state requirement is documented beyond the standard formation filing, registered agent, and annual report obligations described above.",
        "sourcePages": [
          20
        ],
        "topics": [],
        "serviceKeys": []
      },
      {
        "key": "annual_tax",
        "label": "Annual Tax",
        "sourceHeading": "ANNUAL TAX",
        "order": 10,
        "kind": "highlighted",
        "flag": "state_requirement",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": "franchise_tax_annual_tax_or_annual_fee",
        "notApplicable": false,
        "content": "The Delaware LLC annual tax is $400. This was increased from $300 and shipped internally as NCDNT-518 (test case WA-1350) — any internal document still quoting $300 is out of date. Delaware corporations pay $450. Delaware is the only state where our renewal due-date engine is entity-aware, meaning it applies a different rule to LLCs than to corporations.",
        "sourcePages": [
          20
        ],
        "topics": [
          "annual_tax",
          "renewal"
        ],
        "serviceKeys": []
      }
    ]
  },
  {
    "id": "llc-fl-state-services",
    "slug": "florida-llc-services-and-requirements",
    "title": "Florida — LLC Services & Requirements",
    "entityType": "llc",
    "jurisdictionCode": "FL",
    "jurisdictionName": "Florida",
    "articleType": "state_services",
    "status": "published",
    "audience": "internal",
    "internalOnly": true,
    "counselReviewed": false,
    "lastReviewedAt": null,
    "createdAt": "2026-09-25T00:00:00.000Z",
    "updatedAt": "2026-09-25T00:00:00.000Z",
    "provenance": {
      "sourceId": "llc-formation-services-by-state-2026-09-10",
      "pages": [
        23,
        24
      ],
      "sourceEntryHeader": "Florida FL",
      "contentsMarksHighlighted": true
    },
    "aliases": [
      "Florida",
      "FL",
      "Florida LLC",
      "FL LLC"
    ],
    "serviceProfile": {
      "formationFulfillment": {
        "value": "automated_in_house",
        "evidence": {
          "sectionKey": "formation_filing",
          "quote": "Fulfillment: in-house automated filing via our Puppeteer worker — no manual Salesforce case is created."
        }
      },
      "registeredAgent": {
        "value": "in_house",
        "evidence": {
          "sectionKey": "registered_agent",
          "quote": "Provided in-house by Cloud Peak Law"
        }
      },
      "renewalCadence": {
        "value": "annual",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Cadence: Annual."
        }
      },
      "renewalDueDate": {
        "value": "May 1",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Due date computed by our renewal engine: May 1."
        }
      },
      "renewalFulfillment": {
        "value": "automated",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Renewal filing is AUTOMATED for LLCs and Close LLCs."
        }
      },
      "addOnServiceCount": {
        "value": 32,
        "evidence": {
          "sectionKey": "additional_services_available",
          "quote": "32 LLC add-on services are available"
        }
      }
    },
    "sections": [
      {
        "key": "formation_filing",
        "label": "Formation Filing",
        "sourceHeading": "FORMATION FILING",
        "order": 1,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "LLC formation is available and selectable at intake. Fulfillment: in-house automated filing via our Puppeteer worker — no manual Salesforce case is created. Formation tiers: $99 / $199 / $399.",
        "sourcePages": [
          23
        ],
        "topics": [
          "formation"
        ],
        "serviceKeys": [
          "llc_formation"
        ]
      },
      {
        "key": "registered_agent",
        "label": "Registered Agent",
        "sourceHeading": "REGISTERED AGENT",
        "order": 2,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Provided in-house by Cloud Peak Law — this is one of only three states with a native registered agent presence, so service is not vendor-mediated. Includes receipt of service of process and official state mail, scanning, and delivery to the client portal. Registered Agent Switch service is available.",
        "sourcePages": [
          23
        ],
        "topics": [
          "registered_agent"
        ],
        "serviceKeys": [
          "registered_agent",
          "registered_agent_switch"
        ]
      },
      {
        "key": "annual_report_and_renewal_filing",
        "label": "Annual Report and Renewal Filing",
        "sourceHeading": "ANNUAL REPORT AND RENEWAL FILING",
        "order": 3,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Cadence: Annual. Due date computed by our renewal engine: May 1. Renewal filing is AUTOMATED for LLCs and Close LLCs.",
        "sourcePages": [
          23
        ],
        "topics": [
          "annual_report",
          "renewal"
        ],
        "serviceKeys": [
          "annual_report_filing"
        ]
      },
      {
        "key": "amendments_and_sos_filings",
        "label": "Amendments and Secretary of State Filings",
        "sourceHeading": "AMENDMENTS AND SECRETARY OF STATE FILINGS",
        "order": 4,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Article Amendment — $100 service fee. Name Change with the Secretary of State — $100 service fee. Address Change — $100 service fee. In every case the state filing fee is billed as a separate pass-through line at checkout. Where a per-state filing fee has not yet been curated, the fee line is omitted at checkout and the amount is collected by an internal post-purchase process.",
        "sourcePages": [
          23
        ],
        "topics": [
          "amendment",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "article_amendment",
          "sos_name_change",
          "sos_address_change"
        ]
      },
      {
        "key": "certificates_and_certified_copies",
        "label": "Certificates and Certified Copies",
        "sourceHeading": "CERTIFICATES AND CERTIFIED COPIES",
        "order": 5,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Certificate of Good Standing — $35. Certified Copies of Articles of Organization — $100. Apostille (international document authentication) — $250.",
        "sourcePages": [
          23
        ],
        "topics": [
          "good_standing",
          "certified_copy",
          "apostille"
        ],
        "serviceKeys": [
          "certificate_of_good_standing",
          "certified_copies",
          "apostille"
        ]
      },
      {
        "key": "ein_and_tax_elections",
        "label": "EIN and Tax Elections",
        "sourceHeading": "EIN AND TAX ELECTIONS",
        "order": 6,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Employer Identification Number (EIN) — $75. Foreign EIN for non-US residents without an SSN or ITIN — available. S-Corp Tax Election, Form 2553 — $150. Change of tax classification to C-Corp, Partnership or Disregarded Entity, Form 8832 (LLC only) — $150. Update Business Address with the IRS, Form 8822 — $100. Update Responsible Party — $100. Update both — $100. Change Company Name on file with the IRS — $150.",
        "sourcePages": [
          23
        ],
        "topics": [
          "ein",
          "tax_election",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "ein",
          "foreign_ein",
          "s_corp_election",
          "tax_classification_change",
          "irs_address_update",
          "irs_responsible_party_update",
          "irs_name_change"
        ]
      },
      {
        "key": "formation_documents_included",
        "label": "Formation Documents Included",
        "sourceHeading": "FORMATION DOCUMENTS INCLUDED",
        "order": 7,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Generated at formation: Operating Agreement, Organizational Minutes, and Resolution to Open a Bank Account. Available separately: Updated Operating Agreement — $50. Custom Annual Meeting Minutes for LLCs — $50. Special, Contribution, and Distribution Meeting Minutes and Resolutions — $25 each. Certificate of Incumbency, standard or custom — $100. Assignment of Interest — $100. Membership changes (new member joining, company buyout of a departing member, member-to-member buyout, appointment of a new manager, manager removal by member vote) — $100 each. Non-Disclosure Agreement — $100. Independent Contractor Agreement — $100. Digital Asset Assignment — $50.",
        "sourcePages": [
          23
        ],
        "topics": [
          "formation",
          "operating_agreement",
          "governance_documents",
          "membership_changes"
        ],
        "serviceKeys": [
          "operating_agreement_update",
          "annual_meeting_minutes",
          "meeting_minutes_resolutions",
          "certificate_of_incumbency",
          "assignment_of_interest",
          "membership_change",
          "nda",
          "independent_contractor_agreement",
          "digital_asset_assignment"
        ]
      },
      {
        "key": "additional_services_available",
        "label": "Additional Services Available",
        "sourceHeading": "ADDITIONAL SERVICES AVAILABLE",
        "order": 8,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "32 LLC add-on services are available — the 30-product baseline plus Convert LLC to Corporation and DBA / Trade Name.",
        "sourcePages": [
          23
        ],
        "topics": [
          "conversion",
          "dba"
        ],
        "serviceKeys": [
          "convert_llc_to_corporation",
          "dba"
        ]
      },
      {
        "key": "state_specific_requirements",
        "label": "State-Specific Requirements",
        "sourceHeading": "STATE-SPECIFIC REQUIREMENTS",
        "order": 9,
        "kind": "state_specific",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": true,
        "content": "N/A — no LLC-specific state requirement is documented beyond the standard formation filing, registered agent, and annual report obligations described above.",
        "sourcePages": [
          24
        ],
        "topics": [],
        "serviceKeys": []
      },
      {
        "key": "fees_and_late_penalty",
        "label": "Fees and Late Penalty — Client Disclosure Recommended",
        "sourceHeading": "FEES AND LATE PENALTY — CLIENT DISCLOSURE RECOMMENDED",
        "order": 10,
        "kind": "highlighted",
        "flag": "client_disclosure",
        "clientDisclosure": "recommended",
        "verification": "documented",
        "highlightCategory": "unlisted",
        "notApplicable": false,
        "content": "The Florida LLC formation filing fee is $125 (corporations pay $70). The LLC annual report is $138.75 (corporations pay $150). Most importantly, Florida's $400 late fee is statutory and has NO waiver provision — it is the harshest annual-report late penalty in the country. Administrative dissolution follows if the report is not filed by the third Friday in September, and profit reinstatement then costs $600 plus report fees.",
        "sourcePages": [
          24
        ],
        "topics": [
          "formation",
          "annual_report",
          "late_penalty",
          "dissolution",
          "reinstatement"
        ],
        "serviceKeys": []
      }
    ]
  },
  {
    "id": "llc-wy-state-services",
    "slug": "wyoming-llc-services-and-requirements",
    "title": "Wyoming — LLC Services & Requirements",
    "entityType": "llc",
    "jurisdictionCode": "WY",
    "jurisdictionName": "Wyoming",
    "articleType": "state_services",
    "status": "published",
    "audience": "internal",
    "internalOnly": true,
    "counselReviewed": false,
    "lastReviewedAt": null,
    "createdAt": "2026-09-25T00:00:00.000Z",
    "updatedAt": "2026-09-25T00:00:00.000Z",
    "provenance": {
      "sourceId": "llc-formation-services-by-state-2026-09-10",
      "pages": [
        105,
        106
      ],
      "sourceEntryHeader": "Wyoming WY",
      "contentsMarksHighlighted": false
    },
    "aliases": [
      "Wyoming",
      "WY",
      "Wyoming LLC",
      "WY LLC"
    ],
    "serviceProfile": {
      "formationFulfillment": {
        "value": "automated_in_house",
        "evidence": {
          "sectionKey": "formation_filing",
          "quote": "Fulfillment: in-house automated filing via our Puppeteer worker — no manual Salesforce case is created."
        }
      },
      "registeredAgent": {
        "value": "in_house",
        "evidence": {
          "sectionKey": "registered_agent",
          "quote": "Provided in-house by Cloud Peak Law"
        }
      },
      "renewalCadence": {
        "value": "annual",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Cadence: Annual."
        }
      },
      "renewalDueDate": {
        "value": "First day of the formation-anniversary month",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Due date computed by our renewal engine: First day of the formation-anniversary month."
        }
      },
      "renewalFulfillment": {
        "value": "automated",
        "evidence": {
          "sectionKey": "annual_report_and_renewal_filing",
          "quote": "Renewal filing is AUTOMATED for all entity types"
        }
      },
      "addOnServiceCount": {
        "value": 34,
        "evidence": {
          "sectionKey": "additional_services_available",
          "quote": "34 LLC add-on services are available"
        }
      }
    },
    "sections": [
      {
        "key": "formation_filing",
        "label": "Formation Filing",
        "sourceHeading": "FORMATION FILING",
        "order": 1,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "LLC formation is available and selectable at intake. Fulfillment: in-house automated filing via our Puppeteer worker — no manual Salesforce case is created. Wyoming is the only state with automated name-availability and Secretary of State search at intake. Instant Formation is available as an upgrade at $249. Formation tiers: $99 / $199 / $399.",
        "sourcePages": [
          105
        ],
        "topics": [
          "formation"
        ],
        "serviceKeys": [
          "llc_formation",
          "instant_formation"
        ]
      },
      {
        "key": "registered_agent",
        "label": "Registered Agent",
        "sourceHeading": "REGISTERED AGENT",
        "order": 2,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Provided in-house by Cloud Peak Law — this is one of only three states with a native registered agent presence, so service is not vendor-mediated. Includes receipt of service of process and official state mail, scanning, and delivery to the client portal. Registered Agent Switch service is available.",
        "sourcePages": [
          105
        ],
        "topics": [
          "registered_agent"
        ],
        "serviceKeys": [
          "registered_agent",
          "registered_agent_switch"
        ]
      },
      {
        "key": "annual_report_and_renewal_filing",
        "label": "Annual Report and Renewal Filing",
        "sourceHeading": "ANNUAL REPORT AND RENEWAL FILING",
        "order": 3,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Cadence: Annual. Due date computed by our renewal engine: First day of the formation-anniversary month. Renewal filing is AUTOMATED for all entity types — Wyoming has the most complete renewal automation of any state.",
        "sourcePages": [
          105
        ],
        "topics": [
          "annual_report",
          "renewal"
        ],
        "serviceKeys": [
          "annual_report_filing"
        ]
      },
      {
        "key": "amendments_and_sos_filings",
        "label": "Amendments and Secretary of State Filings",
        "sourceHeading": "AMENDMENTS AND SECRETARY OF STATE FILINGS",
        "order": 4,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Article Amendment — $100 service fee. Name Change with the Secretary of State — $100 service fee. Address Change — $100 service fee. In every case the state filing fee is billed as a separate pass-through line at checkout. Where a per-state filing fee has not yet been curated, the fee line is omitted at checkout and the amount is collected by an internal post-purchase process.",
        "sourcePages": [
          105
        ],
        "topics": [
          "amendment",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "article_amendment",
          "sos_name_change",
          "sos_address_change"
        ]
      },
      {
        "key": "certificates_and_certified_copies",
        "label": "Certificates and Certified Copies",
        "sourceHeading": "CERTIFICATES AND CERTIFIED COPIES",
        "order": 5,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Certificate of Good Standing — $35. Certified Copies of Articles of Organization — $100. Apostille (international document authentication) — $250.",
        "sourcePages": [
          105
        ],
        "topics": [
          "good_standing",
          "certified_copy",
          "apostille"
        ],
        "serviceKeys": [
          "certificate_of_good_standing",
          "certified_copies",
          "apostille"
        ]
      },
      {
        "key": "ein_and_tax_elections",
        "label": "EIN and Tax Elections",
        "sourceHeading": "EIN AND TAX ELECTIONS",
        "order": 6,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Employer Identification Number (EIN) — $75. Foreign EIN for non-US residents without an SSN or ITIN — available. S-Corp Tax Election, Form 2553 — $150. Change of tax classification to C-Corp, Partnership or Disregarded Entity, Form 8832 (LLC only) — $150. Update Business Address with the IRS, Form 8822 — $100. Update Responsible Party — $100. Update both — $100. Change Company Name on file with the IRS — $150.",
        "sourcePages": [
          105
        ],
        "topics": [
          "ein",
          "tax_election",
          "name_change",
          "address_change"
        ],
        "serviceKeys": [
          "ein",
          "foreign_ein",
          "s_corp_election",
          "tax_classification_change",
          "irs_address_update",
          "irs_responsible_party_update",
          "irs_name_change"
        ]
      },
      {
        "key": "formation_documents_included",
        "label": "Formation Documents Included",
        "sourceHeading": "FORMATION DOCUMENTS INCLUDED",
        "order": 7,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Generated at formation: Operating Agreement, Organizational Minutes, and Resolution to Open a Bank Account. Available separately: Updated Operating Agreement — $50. Custom Annual Meeting Minutes for LLCs — $50. Special, Contribution, and Distribution Meeting Minutes and Resolutions — $25 each. Certificate of Incumbency, standard or custom — $100. Assignment of Interest — $100. Membership changes (new member joining, company buyout of a departing member, member-to-member buyout, appointment of a new manager, manager removal by member vote) — $100 each. Non-Disclosure Agreement — $100. Independent Contractor Agreement — $100. Digital Asset Assignment — $50.",
        "sourcePages": [
          105
        ],
        "topics": [
          "formation",
          "operating_agreement",
          "governance_documents",
          "membership_changes"
        ],
        "serviceKeys": [
          "operating_agreement_update",
          "annual_meeting_minutes",
          "meeting_minutes_resolutions",
          "certificate_of_incumbency",
          "assignment_of_interest",
          "membership_change",
          "nda",
          "independent_contractor_agreement",
          "digital_asset_assignment"
        ]
      },
      {
        "key": "additional_services_available",
        "label": "Additional Services Available",
        "sourceHeading": "ADDITIONAL SERVICES AVAILABLE",
        "order": 8,
        "kind": "standard",
        "flag": "none",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "34 LLC add-on services are available — the highest of any jurisdiction. The 30-product baseline plus Convert LLC to Corporation, Custom Operating Agreement, Instant Formation, and DBA / Trade Name.",
        "sourcePages": [
          106
        ],
        "topics": [
          "conversion",
          "operating_agreement",
          "formation",
          "dba"
        ],
        "serviceKeys": [
          "convert_llc_to_corporation",
          "custom_operating_agreement",
          "instant_formation",
          "dba"
        ]
      },
      {
        "key": "state_specific_requirements",
        "label": "State-Specific Requirements",
        "sourceHeading": "STATE-SPECIFIC REQUIREMENTS",
        "order": 9,
        "kind": "state_specific",
        "flag": "state_requirement",
        "clientDisclosure": null,
        "verification": "documented",
        "highlightCategory": null,
        "notApplicable": false,
        "content": "Wyoming is our home jurisdiction and has the deepest service coverage. Products restricted to Wyoming: Instant Formation ($249), Custom Operating Agreement ($200), DBA Cancellation, DBA Reassignment ($100, includes the $25 state filing), and Convert LLC to Close LLC. Wyoming also has the largest library of state-restricted document templates (15 of the 24 state-restricted templates in the catalog). A Wyoming-specific address validation rule applies at intake.",
        "sourcePages": [
          106
        ],
        "topics": [
          "formation",
          "operating_agreement",
          "dba",
          "conversion"
        ],
        "serviceKeys": [
          "instant_formation",
          "custom_operating_agreement",
          "dba_cancellation",
          "dba_reassignment",
          "convert_llc_to_close_llc"
        ]
      }
    ]
  }
];
