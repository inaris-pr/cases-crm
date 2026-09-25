/**
 * Case lifecycle UI (Phase 7): category chip, escalation banner and actions,
 * closing/resolution details, and the lifecycle & escalation history.
 * What an employee may do comes from caseControls (lib/access); the API
 * enforces the same rules.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, History, Siren, Tag } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { CaseCategory, CaseDetail, CaseEscalation, EscalationReason } from "@/lib/api";
import {
  CASE_CATEGORY_OPTIONS,
  CASE_STATUS_PICKER_LABEL,
  ESCALATION_REASON_OPTIONS,
  categoryLabel,
  escalationReasonLabel,
  formatDuration,
} from "@/lib/caseMeta";
import { Button } from "@/components/ui/Button";
import { Label, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const when = (iso: string) =>
  formatDate(iso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Small category pill for headers, rows and cards. Uncategorized shows nothing unless `showNone`. */
export function CategoryChip({
  category,
  showNone,
  className,
}: {
  category: CaseCategory | null;
  showNone?: boolean;
  className?: string;
}) {
  if (!category && !showNone) return null;
  return (
    <span
      data-testid="case-category-chip"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium max-w-full",
        category ? "border-sky-400/25 bg-sky-400/10 text-sky-200" : "border-white/10 text-white/40",
        className,
      )}
      title={`Category: ${categoryLabel(category)}`}
    >
      <Tag size={9} className="shrink-0" />
      <span className="truncate">{categoryLabel(category)}</span>
    </span>
  );
}

/** Compact "Escalated" marker for rows, cards and the board. */
export function EscalationMarker({ escalation, className }: { escalation: CaseEscalation | null; className?: string }) {
  if (!escalation) return null;
  return (
    <span
      data-testid="case-escalated-marker"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200",
        className,
      )}
      title={`Escalated: ${escalationReasonLabel(escalation.reason)} — by ${escalation.escalatedByName}`}
    >
      <Siren size={9} className="shrink-0" />
      Escalated
    </span>
  );
}

function useInvalidateCase(caseId: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["case", caseId] });
    qc.invalidateQueries({ queryKey: ["cases"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

/**
 * The escalation strip under the Case header: the active escalation with
 * Resolve (cases.edit), or an Escalate action (cases.work) when none.
 */
export function EscalationBar({
  caseDetail,
  canEscalate,
  canResolve,
}: {
  caseDetail: CaseDetail;
  canEscalate: boolean;
  canResolve: boolean;
}) {
  const active = caseDetail.activeEscalation;
  const invalidate = useInvalidateCase(caseDetail.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<EscalationReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const escalate = useMutation({
    mutationFn: () =>
      fetchJson(API(`/api/cases/${caseDetail.id}/escalations`), {
        method: "POST",
        body: JSON.stringify({ reason, note: note.trim() || null }),
      }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      setNote("");
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(/already_escalated/.test(e.message) ? "This case is already escalated." : "Couldn't escalate the case."),
  });
  const resolve = useMutation({
    mutationFn: (id: number) =>
      fetchJson(API(`/api/cases/${caseDetail.id}/escalations/${id}/resolve`), { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });

  if (!active && !canEscalate) return null;

  return (
    <>
      {active ? (
        <div
          data-testid="escalation-banner"
          className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 flex items-start gap-3"
        >
          <Siren size={16} className="text-rose-300 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-rose-100">
              Escalated · <span data-testid="escalation-reason">{escalationReasonLabel(active.reason)}</span>
            </div>
            {active.note && (
              <div className="text-sm text-white/80 mt-0.5 whitespace-pre-wrap" data-testid="escalation-note">
                {active.note}
              </div>
            )}
            <div className="text-[11px] text-white/50 mt-1" data-testid="escalation-by">
              by {active.escalatedByName} · {when(active.escalatedAt)}
            </div>
          </div>
          {canResolve && (
            <Button
              size="sm"
              variant="outline"
              data-testid="escalation-resolve"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate(active.id)}
            >
              <CheckCircle2 size={12} /> Resolve escalation
            </Button>
          )}
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="danger" data-testid="escalate-open" onClick={() => setOpen(true)}>
            <Siren size={12} /> Escalate
          </Button>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Escalate this case"
        description="Raises the case for attention with a reason. Priority is not changed. A supervisor (or anyone who can edit the case) resolves it."
        widthClass="max-w-md"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) escalate.mutate();
          }}
        >
          <div>
            <Label>Reason</Label>
            <Select
              data-testid="escalate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as EscalationReason)}
              required
            >
              <option value="" disabled>
                Choose a reason…
              </option>
              {ESCALATION_REASON_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea
              data-testid="escalate-note"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What needs attention, and why"
            />
          </div>
          {error && <div className="text-xs text-red-300">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" data-testid="escalate-confirm" disabled={!reason || escalate.isPending}>
              Escalate
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Category field for the Details card: a picker with cases.edit, text otherwise. */
export function CategoryField({
  category,
  canEdit,
  onChange,
}: {
  category: CaseCategory | null;
  canEdit: boolean;
  onChange: (c: CaseCategory | null) => void;
}) {
  if (!canEdit) {
    return (
      <div>
        <div className="text-xs text-white/50 mb-0.5">Category</div>
        <div className="text-sm font-semibold text-white" data-testid="case-category">
          {categoryLabel(category)}
        </div>
      </div>
    );
  }
  return (
    <div>
      <Label>Category</Label>
      <Select
        data-testid="case-category-select"
        value={category ?? ""}
        onChange={(e) => onChange((e.target.value || null) as CaseCategory | null)}
      >
        <option value="">Uncategorized</option>
        {CASE_CATEGORY_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Closed date and resolution time. A Case closed before Phase 7 has no
 * recorded closing time: it says so and shows no duration.
 */
export function ClosureInfo({ caseDetail }: { caseDetail: CaseDetail }) {
  if (caseDetail.status !== "completed") return null;
  const r = caseDetail.resolution;
  return (
    <>
      <div data-testid="case-closed-at">
        <div className="text-xs text-white/50 mb-0.5">Closed</div>
        {caseDetail.closedAt ? (
          <div className="text-sm font-semibold text-white">
            {formatDate(caseDetail.closedAt, { month: "short", day: "numeric", year: "numeric" })}
            {caseDetail.closedByName && <span className="text-white/50 font-normal"> · by {caseDetail.closedByName}</span>}
          </div>
        ) : (
          <div className="text-sm text-white/50">Closed date unavailable</div>
        )}
      </div>
      {r && (
        <div data-testid="case-resolution">
          <div className="text-xs text-white/50 mb-0.5">Resolution time</div>
          <div className="text-sm font-semibold text-white" title="Calendar time from creation to the current closure — not business hours">
            {formatDuration(r.totalMs)}
          </div>
          {r.latestCycleMs !== null && (
            <div className="text-[11px] text-white/50">
              Latest cycle (reopened → closed): {formatDuration(r.latestCycleMs)} · closed {r.closures}×
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Status history and escalation history, collapsed by default. */
export function CaseHistoryCard({ caseDetail }: { caseDetail: CaseDetail }) {
  const [open, setOpen] = useState(false);
  const events = caseDetail.statusHistory ?? [];
  const escalations = caseDetail.escalations ?? [];
  const status = (s: string | null) => (s ? CASE_STATUS_PICKER_LABEL[s as keyof typeof CASE_STATUS_PICKER_LABEL] ?? s : "—");
  const kindLabel = { status_change: "Status changed", closed: "Closed", reopened: "Reopened" } as const;
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025]" data-testid="case-history">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        data-testid="case-history-toggle"
        aria-expanded={open}
      >
        <History size={13} className="text-white/50" />
        <span className="label-eyebrow flex-1">Lifecycle & escalations</span>
        <span className="text-[11px] text-white/40">
          {events.length} change{events.length === 1 ? "" : "s"} · {escalations.length} escalation{escalations.length === 1 ? "" : "s"}
        </span>
        <ChevronDown size={13} className={cn("text-white/40 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          <div>
            <div className="text-xs text-white/50 mb-1.5">Status history</div>
            {events.length === 0 ? (
              <div className="text-xs text-white/40">No status changes recorded yet. Changes are recorded from Phase 7 on.</div>
            ) : (
              <ol className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="text-xs" data-testid={`status-event-${e.kind}`}>
                    <span className="font-semibold text-white/80">{kindLabel[e.kind]}</span>{" "}
                    <span className="text-white/60">
                      {e.fromStatus ? `${status(e.fromStatus)} → ` : ""}
                      {status(e.toStatus)}
                    </span>
                    <div className="text-[11px] text-white/40">
                      {e.changedByName} · {when(e.changedAt)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <div className="text-xs text-white/50 mb-1.5">Escalation history</div>
            {escalations.length === 0 ? (
              <div className="text-xs text-white/40">Never escalated.</div>
            ) : (
              <ol className="space-y-2">
                {escalations.map((e) => (
                  <li key={e.id} className="text-xs" data-testid={e.resolvedAt ? "escalation-history-resolved" : "escalation-history-active"}>
                    <div className="font-semibold text-white/80">
                      {escalationReasonLabel(e.reason)}
                      {!e.resolvedAt && <span className="ml-1.5 text-rose-300">active</span>}
                    </div>
                    {e.note && <div className="text-white/60 whitespace-pre-wrap">{e.note}</div>}
                    <div className="text-[11px] text-white/40">
                      Escalated by {e.escalatedByName} · {when(e.escalatedAt)}
                    </div>
                    {e.resolvedAt && (
                      <div className="text-[11px] text-white/40">
                        Resolved by {e.resolvedByName ?? "—"} · {when(e.resolvedAt)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
