import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Save, Trash2, Move, Globe, Building2, Workflow as WorkflowIcon } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type {
  Automation,
  AutomationGraph,
  AutomationScope,
  AutomationSummary,
  AutomationUsage,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AutomationBuilder,
  type AutomationBuilderHandle,
} from "./AutomationBuilder";
import { AutomationPicker, ScopePill } from "./AutomationPicker";
import { EMPTY_GRAPH } from "./types";

const NAME_MAX = 80;

interface Draft {
  name: string;
  graph: AutomationGraph;
}

const fingerprint = (d: Draft | null) => (d ? JSON.stringify(d) : "");

export interface CaseAutomationsTabProps {
  caseId: number;
  /**
   * Fires whenever unsaved-changes state flips. The Case Detail page uses it
   * to guard tab switches; the component guards page unload itself.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The Automations experience for one case: pick an automation, load it into the
 * visual builder, edit it, save it.
 *
 * A case sees its own automations plus every global it has not customized —
 * the server computes that union, so nothing here materializes per-case copies.
 * Scope actions (Apply to all cases, Customize for this case, Revert to global)
 * arrive in a later stage; a selected global is read-only here and says so.
 */
export function CaseAutomationsTab({ caseId, onDirtyChange }: CaseAutomationsTabProps) {
  const qc = useQueryClient();
  const builderRef = useRef<AutomationBuilderHandle>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [running, setRunning] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<AutomationScope>("case");
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["case-automations", caseId],
    queryFn: () => fetchJson<AutomationSummary[]>(API(`/api/cases/${caseId}/automations`)),
  });

  const detailQ = useQuery({
    queryKey: ["automation", selectedId],
    queryFn: () => fetchJson<Automation>(API(`/api/automations/${selectedId}`)),
    enabled: selectedId !== null,
  });

  // Only fetched while the confirmation is open, so it is always current.
  const usageQ = useQuery({
    queryKey: ["automation-usage", selectedId],
    queryFn: () => fetchJson<AutomationUsage>(API(`/api/automations/${selectedId}/usage`)),
    enabled: confirmSaveOpen && selectedId !== null,
  });

  const automations = useMemo(() => listQ.data ?? [], [listQ.data]);
  const selectedSummary = automations.find((a) => a.id === selectedId) ?? null;
  const isGlobal = selectedSummary?.scope === "global";
  const dirty = draft !== null && fingerprint(draft) !== baseline;

  // Select the first automation once the list arrives.
  useEffect(() => {
    if (selectedId === null && automations.length > 0) setSelectedId(automations[0].id);
  }, [automations, selectedId]);

  // Load the fetched automation into the editable draft. Keyed on identity and
  // updatedAt so a save that changes nothing does not clobber local edits.
  const loadedKey = detailQ.data ? `${detailQ.data.id}:${detailQ.data.updatedAt}` : null;
  useEffect(() => {
    if (!detailQ.data) return;
    const next: Draft = { name: detailQ.data.name, graph: detailQ.data.graph };
    setDraft(next);
    setBaseline(fingerprint(next));
    setError(null);
  }, [loadedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before a full page navigation with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const create = useMutation({
    mutationFn: (vars: { name: string; scope: AutomationScope }) =>
      fetchJson<Automation>(API(`/api/cases/${caseId}/automations`), {
        method: "POST",
        // One request creates the intended scope. A global is never created
        // case-scoped and then promoted; the server sets caseId and
        // originCaseId from this case.
        body: JSON.stringify({ name: vars.name, scope: vars.scope, graph: EMPTY_GRAPH }),
      }),
    onSuccess: (created) => {
      // A new global belongs to every case, so drop every cached case list,
      // not just this one.
      qc.invalidateQueries({
        queryKey: created.scope === "global" ? ["case-automations"] : ["case-automations", caseId],
      });
      setSelectedId(created.id);
      const next: Draft = { name: created.name, graph: created.graph };
      setDraft(next);
      setBaseline(fingerprint(next));
      closeNew();
      setError(null);
    },
    onError: (e: Error) => setError(e.message || "Could not create the automation."),
  });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      fetchJson<Automation>(API(`/api/automations/${selectedId}`), {
        method: "PATCH",
        body: JSON.stringify({ name: d.name.trim(), graph: d.graph }),
      }),
    onSuccess: (saved) => {
      const next: Draft = { name: saved.name, graph: saved.graph };
      setDraft(next);
      setBaseline(fingerprint(next));
      // A global is one shared row, so every case's list is now stale.
      qc.invalidateQueries({
        queryKey: saved.scope === "global" ? ["case-automations"] : ["case-automations", caseId],
      });
      qc.invalidateQueries({ queryKey: ["automation", saved.id] });
      setConfirmSaveOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message || "Could not save the automation."),
  });

  function closeNew() {
    setNewOpen(false);
    setNewName("");
    setNewScope("case");
    setConfirmGlobal(false);
  }

  /** "All cases" is a bigger commitment, so it confirms before submitting. */
  function submitNew() {
    if (newNameError) return;
    if (newScope === "global" && !confirmGlobal) {
      setConfirmGlobal(true);
      return;
    }
    create.mutate({ name: newNameTrimmed, scope: newScope });
  }

  /**
   * Editing a global changes it for every case, so saving one confirms first.
   * Cancelling leaves the draft exactly as it is — no edits are discarded.
   */
  function requestSave() {
    if (!draft || !canSave) return;
    if (isGlobal) {
      setConfirmSaveOpen(true);
      return;
    }
    save.mutate(draft);
  }

  function requestSelect(id: number) {
    if (id === selectedId) return;
    if (dirty) {
      setPendingSelectId(id);
      return;
    }
    setSelectedId(id);
  }

  function discardAndSwitch() {
    if (pendingSelectId !== null) setSelectedId(pendingSelectId);
    setPendingSelectId(null);
  }

  const trimmedName = (draft?.name ?? "").trim();
  const nameError =
    trimmedName.length === 0
      ? "A name is required."
      : trimmedName.length > NAME_MAX
        ? `Keep the name to ${NAME_MAX} characters or fewer.`
        : null;
  const duplicateName =
    trimmedName.length > 0 &&
    automations.some(
      (a) => a.id !== selectedId && a.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

  const newNameTrimmed = newName.trim();
  const newNameError =
    newNameTrimmed.length === 0
      ? "A name is required."
      : newNameTrimmed.length > NAME_MAX
        ? `Keep the name to ${NAME_MAX} characters or fewer.`
        : null;
  const newNameDuplicate =
    newNameTrimmed.length > 0 &&
    automations.some((a) => a.name.trim().toLowerCase() === newNameTrimmed.toLowerCase());

  const canSave = dirty && !nameError && !save.isPending;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-[16rem] max-w-sm flex-1">
          <AutomationPicker
            automations={automations}
            selectedId={selectedId}
            onSelect={requestSelect}
            disabled={listQ.isLoading || automations.length === 0}
          />
        </div>
        {selectedSummary && <ScopePill scope={selectedSummary.scope} />}
        {dirty && (
          <span className="text-[11px] text-amber-300/90 uppercase tracking-widest">
            Unsaved changes
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => setNewOpen(true)}>
            <Plus size={14} />
            New
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRunning(true);
              setTimeout(() => setRunning(false), 2200);
            }}
            disabled={!draft}
          >
            <Play size={14} />
            {running ? "Running…" : "Run"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => builderRef.current?.resetView()}
            title="Reset view"
            disabled={!draft}
          >
            <Move size={14} />
            Reset view
          </Button>
          <Button
            variant="outline"
            onClick={() => draft && setDraft({ ...draft, graph: { ...draft.graph, nodes: [], edges: [] } })}
            disabled={!draft}
          >
            <Trash2 size={14} />
            Clear
          </Button>
          <Button onClick={requestSave} disabled={!canSave}>
            <Save size={14} />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Global banner */}
      {isGlobal && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5">
          <Globe size={15} className="text-amber-300 mt-0.5 shrink-0" />
          <div className="text-[12px] leading-relaxed">
            <span className="font-semibold text-amber-200">
              This automation is shared with every case.
            </span>{" "}
            <span className="text-white/60">
              You can edit it here, and saving asks you to confirm first because the change
              reaches every case using it. Cases that have customized their own copy are not
              affected.
            </span>
          </div>
        </div>
      )}

      {/* Name + validation */}
      {draft && (
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-[18rem] max-w-md flex-1">
            <Label>Automation name</Label>
            <Input
              value={draft.name}
              maxLength={NAME_MAX + 20}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Renewal reminder"
            />
            {nameError && (
              <div className="text-[11px] text-rose-300 mt-1">{nameError}</div>
            )}
            {!nameError && duplicateName && (
              <div className="text-[11px] text-amber-300/90 mt-1">
                Another automation on this case already uses this name. That is allowed, but
                it will be harder to tell them apart.
              </div>
            )}
          </div>
          {selectedSummary && (
            <div className="text-[11px] text-white/40 pt-6 space-y-0.5">
              <div>
                {selectedSummary.nodeCount} node{selectedSummary.nodeCount === 1 ? "" : "s"} ·{" "}
                {selectedSummary.edgeCount} connection{selectedSummary.edgeCount === 1 ? "" : "s"}
              </div>
              {selectedSummary.customized && (
                <div className="text-amber-300/80">Customized copy of a global automation</div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {/* Builder / empty states */}
      {listQ.isLoading ? (
        <div className="text-sm text-white/40 py-12 text-center">Loading automations…</div>
      ) : automations.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No automations yet"
          description="Create one for this case, or apply an automation to every case from another case."
          cta={
            <Button onClick={() => setNewOpen(true)}>
              <Plus size={14} />
              New automation
            </Button>
          }
        />
      ) : draft ? (
        <AutomationBuilder
          ref={builderRef}
          value={draft.graph}
          onChange={(graph) => setDraft({ ...draft, graph })}
          running={running}
          className="h-[560px]"
        />
      ) : (
        <div className="text-sm text-white/40 py-12 text-center">Loading automation…</div>
      )}

      {/* New automation */}
      <Modal
        open={newOpen}
        onClose={closeNew}
        title={confirmGlobal ? "Create this automation for all cases?" : "New automation"}
        description={
          confirmGlobal
            ? undefined
            : "Choose whether it belongs to this case alone or to every case."
        }
        widthClass="max-w-md"
      >
        {confirmGlobal ? (
          <div className="space-y-4">
            <p className="text-[13px] text-white/70 leading-relaxed">
              <span className="font-semibold text-white">{newNameTrimmed}</span> will be
              available to all existing cases and automatically to every case created in
              future. Anyone editing it later changes it for every case.
            </p>
            <InlineError message={create.isError ? error : null} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmGlobal(false)}>
                Cancel
              </Button>
              <Button onClick={submitNew} disabled={create.isPending}>
                <Globe size={14} />
                {create.isPending ? "Creating…" : "Create for all cases"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                autoFocus
                value={newName}
                maxLength={NAME_MAX + 20}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Renewal reminder"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNew();
                }}
              />
              {newName.length > 0 && newNameError && (
                <div className="text-[11px] text-rose-300 mt-1">{newNameError}</div>
              )}
              {!newNameError && newNameDuplicate && (
                <div className="text-[11px] text-amber-300/90 mt-1">
                  This case already has an automation with that name. That is allowed, but it
                  will be harder to tell them apart.
                </div>
              )}
            </div>

            <div>
              <Label>Apply this automation to</Label>
              <div className="space-y-2">
                <ScopeCard
                  selected={newScope === "case"}
                  onSelect={() => setNewScope("case")}
                  icon={Building2}
                  title="This case only"
                  description="Only available for this case."
                />
                <ScopeCard
                  selected={newScope === "global"}
                  onSelect={() => setNewScope("global")}
                  icon={Globe}
                  title="All cases"
                  description="Available to every existing case, and automatically to every future case."
                />
              </div>
            </div>

            <InlineError message={create.isError ? error : null} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={closeNew}>
                Cancel
              </Button>
              <Button onClick={submitNew} disabled={!!newNameError || create.isPending}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Saving a global reaches every case */}
      <Modal
        open={confirmSaveOpen}
        onClose={() => setConfirmSaveOpen(false)}
        title="Save changes to all cases?"
        widthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-white/70 leading-relaxed">
            <span className="font-semibold text-white">{trimmedName}</span> is a global
            automation. Saving updates it for{" "}
            {usageQ.data ? (
              <span className="font-semibold text-white">
                {usageQ.data.caseCount} case{usageQ.data.caseCount === 1 ? "" : "s"}
              </span>
            ) : (
              "every case using it"
            )}
            {usageQ.data && usageQ.data.forkedByCaseCount > 0 && (
              <>
                {" "}
                <span className="text-white/50">
                  ({usageQ.data.forkedByCaseCount} case
                  {usageQ.data.forkedByCaseCount === 1 ? " has" : "s have"} customized their own
                  copy and will not change)
                </span>
              </>
            )}
            .
          </p>
          <InlineError message={save.isError ? error : null} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => draft && save.mutate(draft)}
              disabled={save.isPending}
            >
              <Globe size={14} />
              {save.isPending ? "Saving…" : "Save changes to all cases"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Unsaved changes when switching automation */}
      <Modal
        open={pendingSelectId !== null}
        onClose={() => setPendingSelectId(null)}
        title="Discard unsaved changes?"
        description="This automation has edits that have not been saved. Switching now will lose them."
        widthClass="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingSelectId(null)}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={discardAndSwitch}>
            Discard and switch
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Errors from a mutation started inside a modal have to render inside that
 * modal — the page-level banner sits behind the overlay and would be invisible.
 */
function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
      {message}
    </div>
  );
}

/** Radio-style choice card, matching the panel styling used elsewhere. */
function ScopeCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof Globe;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={
        "w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 transition focus-ring " +
        (selected
          ? "border-[var(--color-primary)]/60 bg-[var(--color-primary)]/[0.07]"
          : "border-white/10 bg-white/[0.02] hover:bg-white/5")
      }
    >
      <span
        className={
          "mt-0.5 size-4 shrink-0 rounded-full border grid place-items-center " +
          (selected ? "border-[var(--color-primary)]" : "border-white/25")
        }
      >
        {selected && <span className="size-2 rounded-full bg-[var(--color-primary)]" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
          <Icon size={13} className={selected ? "text-[var(--color-primary)]" : "text-white/50"} />
          {title}
        </span>
        <span className="block text-[11px] text-white/50 mt-0.5 leading-relaxed">
          {description}
        </span>
      </span>
    </button>
  );
}
