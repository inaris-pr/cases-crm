/**
 * Knowledge Base read API (Phase 8 foundation). Read-only: the pilot articles
 * are source-controlled content, so there is no create/update route yet.
 *
 *   GET /api/knowledge/articles              summaries (+ matching section ids)
 *   GET /api/knowledge/articles/:idOrSlug    one article, ordered sections
 *
 * Both require knowledge.view (lib/access). Only published articles are
 * readable; anything else is a 404, exactly like an unknown article.
 *
 * Direct vs inherited (Phase 8A follow-up): `topics`/`serviceKeys` (= the
 * `direct*` fields) are what the jurisdiction's entry prints;
 * `inherited*` come from explicit national source rules; `effective*` is
 * their safe union. `topic` / `service` filters match effective metadata
 * unless `metadata=direct`. The detail response's `serviceAvailability`
 * says, per service, direct / inherited / not_offered / restricted /
 * disputed / unknown, with the shared records and discrepancies behind it.
 */
import type { Router } from "express";
import { z } from "zod";
import { allow } from "../auth/authorize.js";
import {
  JURISDICTION_CODES,
  KNOWLEDGE_ARTICLE_STATUSES,
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_TOPICS,
  SERVICE_KEYS,
  SOURCE_FLAGS,
  type ServiceKey,
  type JurisdictionCode,
  type KnowledgeTopic,
} from "./model.js";
import { findArticles, knowledgeBase, readable, sharedContextFor, type KnowledgeArticle } from "./repository.js";

const oneOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

const listQuery = z
  .object({
    entityType: oneOf(KNOWLEDGE_ENTITY_TYPES).optional(),
    // "ca" and "CA" both name California; anything else is rejected.
    jurisdiction: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .pipe(oneOf(JURISDICTION_CODES as readonly JurisdictionCode[]))
      .optional(),
    status: oneOf(KNOWLEDGE_ARTICLE_STATUSES).optional(),
    topic: oneOf(KNOWLEDGE_TOPICS as readonly KnowledgeTopic[]).optional(),
    service: oneOf(SERVICE_KEYS as readonly ServiceKey[]).optional(),
    metadata: z.enum(["effective", "direct"]).optional(),
    flag: oneOf(SOURCE_FLAGS).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict();

/** List shape: identity, provenance flags and the section outline — no section text. */
function summary(a: KnowledgeArticle) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    entityType: a.entityType,
    jurisdictionCode: a.jurisdictionCode,
    jurisdictionName: a.jurisdictionName,
    articleType: a.articleType,
    status: a.status,
    audience: a.audience,
    internalOnly: a.internalOnly,
    counselReviewed: a.counselReviewed,
    sourceId: a.provenance.sourceId,
    updatedAt: a.updatedAt,
    topics: a.topics,
    serviceKeys: a.serviceKeys,
    directTopics: a.directTopics,
    inheritedTopics: a.inheritedTopics,
    effectiveTopics: a.effectiveTopics,
    directServiceKeys: a.directServiceKeys,
    inheritedServiceKeys: a.inheritedServiceKeys,
    effectiveServiceKeys: a.effectiveServiceKeys,
    disputedServiceKeys: a.disputedServiceKeys,
    flagSummary: a.flagSummary,
    sections: a.sections.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      order: s.order,
      kind: s.kind,
      flag: s.flag,
      clientDisclosure: s.clientDisclosure,
      verification: s.verification,
      notApplicable: s.notApplicable,
    })),
  };
}

export function registerKnowledgeRoutes(r: Router) {
  r.get("/knowledge/articles", allow("knowledge.view"), (req, res) => {
    const q = listQuery.parse(req.query);
    const matches = findArticles(q);
    res.json({
      count: matches.length,
      articles: matches.map((m) => ({
        ...summary(m.article),
        matchedSectionIds: q.q ? m.sectionIds : undefined,
        matchedInheritedServiceKeys: q.q ? m.inheritedServiceKeys : undefined,
      })),
    });
  });

  r.get("/knowledge/articles/:idOrSlug", allow("knowledge.view"), (req, res) => {
    const key = String(req.params.idOrSlug ?? "");
    const article = knowledgeBase.byIdOrSlug(key);
    if (!article || !readable().includes(article)) return res.status(404).json({ error: "not_found" });
    res.json({
      ...article,
      source: knowledgeBase.source(article.provenance.sourceId),
      ...sharedContextFor(article),
    });
  });
}
