/**
 * Knowledge Base — article reader (Phase 8B).
 *
 * Renders one article exactly as stored: sections in their stored order with
 * their source text, each addressable by `#<section key>`. Highlighted
 * sections are marked by their source flag. Shared (national) services, source
 * discrepancies and services the source says are unavailable here are shown
 * in separate panels — never mixed into the state entry's text — each with
 * its source location. Read-only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, FileText, HelpCircle, Lock, Scale } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import {
  KNOWLEDGE_ENTITY_TYPE_LABELS,
  disputedRows,
  evidenceLabel,
  formatSourceDate,
  sectionPresentation,
  sharedServiceRows,
  unavailableRows,
  type KnowledgeArticleDetail,
  type KnowledgeSection,
  type SharedServiceRow,
} from "@/lib/knowledge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Chip, TONE_ACCENT } from "@/components/knowledge/parts";
import { cn } from "@/lib/cn";

const PANEL_SHARED = "shared-services";
const PANEL_DISPUTED = "source-discrepancies";
const PANEL_UNAVAILABLE = "not-offered";

export function KnowledgeArticle() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery({
    queryKey: ["knowledge", "article", slug],
    queryFn: () => fetchJson<KnowledgeArticleDetail>(API(`/api/knowledge/articles/${encodeURIComponent(slug ?? "")}`)),
    retry: false,
  });

  // Honour a #section anchor once the article is on screen (also after a refresh).
  useEffect(() => {
    if (!q.data) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    // After the page's entry animation has laid out.
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [q.data]);

  if (q.isLoading) return <div className="text-sm text-white/40 py-10 text-center">Loading article…</div>;
  if (q.isError || !q.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="glass-panel" data-testid="knowledge-article-missing">
          <EmptyState
            icon={BookOpen}
            title="Article not found"
            description="There is no published Knowledge Base article at this address."
          />
        </div>
      </div>
    );
  }
  return <Reader article={q.data} />;
}

function BackLink() {
  return (
    <Link href="/knowledge" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
      <ArrowLeft size={13} /> Knowledge Base
    </Link>
  );
}

/** Jump to an anchor without adding a history entry for every click. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(history.state, "", `#${id}`);
}

function Reader({ article: a }: { article: KnowledgeArticleDetail }) {
  const shared = useMemo(() => sharedServiceRows(a), [a]);
  const disputed = useMemo(() => disputedRows(a), [a]);
  const unavailable = useMemo(() => unavailableRows(a), [a]);
  const notice = a.source?.notices.find((n) => n.key === "confidentiality");
  const toc = [
    ...a.sections.map((s) => ({ id: s.key, label: s.label, presentation: sectionPresentation(s) })),
    ...(shared.length ? [{ id: PANEL_SHARED, label: "Shared services", presentation: null }] : []),
    ...(disputed.length ? [{ id: PANEL_DISPUTED, label: "Source discrepancies", presentation: null }] : []),
    ...(unavailable.length ? [{ id: PANEL_UNAVAILABLE, label: "Not offered here (per source)", presentation: null }] : []),
  ];

  return (
    <article className="space-y-4" data-testid="knowledge-article" data-article-id={a.id}>
      <BackLink />

      {/* Header */}
      <header className="glass-panel p-5 space-y-3">
        <div className="label-eyebrow">
          Knowledge · {KNOWLEDGE_ENTITY_TYPE_LABELS[a.entityType] ?? a.entityType}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="knowledge-article-title">
          {a.title}
        </h1>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
          <Meta label="State">
            {a.jurisdictionName} ({a.jurisdictionCode})
          </Meta>
          <Meta label="Entity type">{KNOWLEDGE_ENTITY_TYPE_LABELS[a.entityType] ?? a.entityType}</Meta>
          <Meta label="Source">
            <span data-testid="knowledge-source">{a.source?.title ?? a.provenance.sourceId}</span>
            {a.source ? (
              <span className="block text-white/40">
                {a.source.publisher} · prepared {formatSourceDate(a.source.preparedDate)} · p. {a.provenance.pages.join("–")}
              </span>
            ) : null}
          </Meta>
          <Meta label="Review">
            {a.counselReviewed ? "Reviewed by counsel" : "Not reviewed by counsel"}
            <span className="block text-white/40">
              {a.lastReviewedAt ? `Last reviewed ${formatSourceDate(a.lastReviewedAt)}` : "No internal review recorded"}
            </span>
          </Meta>
        </dl>
        {a.internalOnly ? (
          <div
            data-testid="knowledge-internal-notice"
            className="flex gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white/60"
          >
            <Lock size={13} className="mt-0.5 shrink-0 text-white/40" />
            <div>
              <span className="font-semibold text-white/80">Internal reference.</span>{" "}
              {notice ? notice.text : "Not customer-facing and not reviewed by counsel."}
            </div>
          </div>
        ) : null}
      </header>

      {/* Mobile table of contents */}
      <details className="lg:hidden glass-panel px-4 py-3 text-sm" data-testid="knowledge-toc-mobile">
        <summary className="cursor-pointer text-white/70 text-xs font-semibold uppercase tracking-widest">On this page</summary>
        <TocList items={toc} />
      </details>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          {a.sections.map((s) => (
            <SectionCard key={s.id} section={s} />
          ))}

          {shared.length ? <SharedPanel article={a} rows={shared} /> : null}
          {disputed.length ? <DisputedPanel article={a} rows={disputed} /> : null}
          {unavailable.length ? <UnavailablePanel article={a} rows={unavailable} /> : null}
        </div>

        <aside className="hidden lg:block sticky top-5 glass-panel p-3" data-testid="knowledge-toc">
          <div className="label-eyebrow px-2 mb-1.5">On this page</div>
          <TocList items={toc} />
        </aside>
      </div>
    </article>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-widest text-white/35">{label}</dt>
      <dd className="text-white/80 mt-0.5">{children}</dd>
    </div>
  );
}

function TocList({
  items,
}: {
  items: { id: string; label: string; presentation: ReturnType<typeof sectionPresentation> | null }[];
}) {
  return (
    <ol className="mt-2 space-y-0.5">
      {items.map((i) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            data-testid={`knowledge-toc-${i.id}`}
            onClick={(e) => {
              e.preventDefault();
              jumpTo(i.id);
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-white/55 hover:text-white hover:bg-white/5"
          >
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0",
                !i.presentation || i.presentation.tone === "neutral" || i.presentation.tone === "muted"
                  ? "bg-white/20"
                  : i.presentation.tone === "unresolved"
                    ? "bg-violet-300"
                    : i.presentation.tone === "notice"
                      ? "bg-amber-300"
                      : i.presentation.tone === "warning"
                        ? "bg-orange-300"
                        : "bg-sky-300",
              )}
            />
            <span className="truncate">{i.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

function SectionCard({ section: s }: { section: KnowledgeSection }) {
  const p = sectionPresentation(s);
  const highlighted = s.kind === "highlighted";
  return (
    <section
      id={s.key}
      data-testid={`knowledge-section-${s.key}`}
      data-flag={s.flag}
      data-verification={s.verification}
      className={cn(
        "glass-panel p-4 sm:p-5 scroll-mt-5",
        highlighted && "border-l-2",
        highlighted && TONE_ACCENT[p.tone],
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className={cn("text-sm font-semibold tracking-tight", p.unresolved ? "text-violet-100" : "text-white")}>
          {s.label}
        </h2>
        <div className="flex items-center gap-1.5">
          {p.badge ? (
            <Chip tone={p.tone} testId={`knowledge-section-badge-${s.key}`}>
              {p.unresolved ? <HelpCircle size={10} /> : p.tone === "notice" ? <Scale size={10} /> : p.tone === "warning" ? <AlertTriangle size={10} /> : null}
              {p.badge}
            </Chip>
          ) : null}
          <span className="text-[10px] text-white/30 tabular-nums" title="Page in the source document">
            p. {s.sourcePages.join(", ")}
          </span>
        </div>
      </div>
      {p.note ? <p className="mt-1.5 text-[11px] text-white/50">{p.note}</p> : null}
      <p className={cn("mt-2.5 text-[13px] leading-relaxed", s.notApplicable ? "text-white/45" : "text-white/80")}>
        {s.content}
      </p>
    </section>
  );
}

// ── Shared services, discrepancies, unavailable ──────────────────────────────

function Provenance({ row, articleId }: { row: SharedServiceRow; articleId: string }) {
  const [open, setOpen] = useState(row.status !== "direct");
  const [quotes, setQuotes] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-white/40 hover:text-white/70">
        Printed in this state's entry: {row.directSectionLabels.join(", ")} · show national source
      </button>
    );
  }
  if (!row.evidence.length) return null;
  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {row.evidence.map((e, i) => (
          <li key={i} className="text-[11px] text-white/50">
            {evidenceLabel(e, articleId, row.nationalEvidence)}
            {quotes ? (
              <blockquote className="mt-0.5 mb-1 border-l border-white/10 pl-2 text-white/40 italic">“{e.quote}”</blockquote>
            ) : null}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setQuotes((v) => !v)} className="text-[11px] text-white/35 hover:text-white/70">
        {quotes ? "Hide source text" : "Show source text"}
      </button>
    </div>
  );
}

function ServiceRow({ row, articleId }: { row: SharedServiceRow; articleId: string }) {
  return (
    <li
      className="py-3 first:pt-0 last:pb-0 space-y-1.5"
      data-testid={`knowledge-service-${row.serviceKey}`}
      data-status={row.status}
      data-direct={row.directlyMentioned ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <span className="text-sm text-white/85">{row.label}</span>
        <Chip tone={row.presentation.tone} testId={`knowledge-service-status-${row.serviceKey}`}>
          {row.presentation.label}
        </Chip>
      </div>
      <Provenance row={row} articleId={articleId} />
      {row.caveats.map((c) => (
        <div key={c} className="flex gap-1.5 text-[11px] text-amber-200/80" data-testid={`knowledge-caveat-${row.serviceKey}`}>
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{c}</span>
        </div>
      ))}
    </li>
  );
}

function SharedPanel({ article: a, rows }: { article: KnowledgeArticleDetail; rows: SharedServiceRow[] }) {
  const inherited = rows.filter((r) => r.status === "inherited");
  const disputed = rows.filter((r) => r.status === "disputed");
  const direct = rows.filter((r) => r.status === "direct");
  return (
    <section id={PANEL_SHARED} className="glass-panel p-4 sm:p-5 scroll-mt-5" data-testid="knowledge-shared-services">
      <div className="flex items-start gap-2">
        <FileText size={15} className="mt-0.5 text-white/40 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold">Shared services applicable to {a.jurisdictionName}</h2>
          <p className="text-[11px] text-white/45 mt-0.5">
            Services the source states apply nationally. Anything listed as applying from a national statement is{" "}
            <span className="text-white/70">not printed in the {a.jurisdictionName} entry</span> — its source is shown.
          </p>
        </div>
      </div>
      {inherited.length || disputed.length ? (
        <ul className="mt-3 divide-y divide-white/5">
          {[...inherited, ...disputed].map((r) => (
            <ServiceRow key={r.serviceKey} row={r} articleId={a.id} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-white/45" data-testid="knowledge-shared-none-inherited">
          Every nationally stated service is also printed in the {a.jurisdictionName} entry.
        </p>
      )}
      {direct.length ? (
        <details className="mt-3 rounded-lg border border-white/5 px-3 py-2" data-testid="knowledge-shared-direct">
          <summary className="cursor-pointer text-[11px] text-white/55">
            Also printed in the {a.jurisdictionName} entry · {direct.length}
          </summary>
          <ul className="mt-2 divide-y divide-white/5">
            {direct.map((r) => (
              <ServiceRow key={r.serviceKey} row={r} articleId={a.id} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function DisputedPanel({ article: a, rows }: { article: KnowledgeArticleDetail; rows: SharedServiceRow[] }) {
  return (
    <section id={PANEL_DISPUTED} className="glass-panel p-4 sm:p-5 scroll-mt-5 border-l-2 border-dashed border-l-violet-300/60" data-testid="knowledge-discrepancies">
      <div className="flex items-start gap-2">
        <HelpCircle size={15} className="mt-0.5 text-violet-200 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold">Source discrepancies</h2>
          <p className="text-[11px] text-white/45 mt-0.5">
            The internal source contradicts itself about these services. Neither statement is confirmed here — check
            before telling a client either way.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-4">
        {rows.map((r) => {
          const ds = a.sourceDiscrepancies.filter((d) => r.discrepancyIds.includes(d.id));
          return (
            <li key={r.serviceKey} data-testid={`knowledge-disputed-${r.serviceKey}`} data-status={r.status}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <span className="text-sm text-white/85">{r.label}</span>
                <Chip tone="unresolved">Source discrepancy — not confirmed</Chip>
              </div>
              {ds.map((d) => (
                <div key={d.id} className="mt-1.5 space-y-1.5">
                  <div className="text-[11px] text-white/55">{d.question}</div>
                  <ul className="space-y-1.5">
                    {d.claims.map((c, i) => (
                      <li key={i} className="text-[11px] text-white/45">
                        <div className="text-white/55">{evidenceLabel(c, a.id)}</div>
                        <blockquote className="mt-0.5 border-l border-white/10 pl-2 text-white/40 italic">“{c.quote}”</blockquote>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function UnavailablePanel({ article: a, rows }: { article: KnowledgeArticleDetail; rows: SharedServiceRow[] }) {
  return (
    <details id={PANEL_UNAVAILABLE} className="glass-panel p-4 sm:p-5 scroll-mt-5" data-testid="knowledge-unavailable">
      <summary className="cursor-pointer text-sm font-semibold">
        Not offered in {a.jurisdictionName} (per source) <span className="text-white/40 font-normal">· {rows.length}</span>
      </summary>
      <p className="text-[11px] text-white/45 mt-1.5">
        Only services the source explicitly says are not products, not sold here, or restricted to other states.
        A service simply not mentioned is not listed here.
      </p>
      <ul className="mt-3 divide-y divide-white/5">
        {rows.map((r) => (
          <ServiceRow key={r.serviceKey} row={r} articleId={a.id} />
        ))}
      </ul>
    </details>
  );
}
