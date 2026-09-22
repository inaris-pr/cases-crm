import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Save, Trash2, Move, Globe, Workflow as WorkflowIcon } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { Automation, AutomationGraph, AutomationSummary } from "@/lib/api";
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
    mutationFn: (name: string) =>
      fetchJson<Automation>(API(`/api/cases/${caseId}/automations`), {
        method: "POST",
        // scope "case" and this caseId are set server-side: a new automation
        // never touches another case.
        body: JSON.stringify({ name, graph: EMPTY_GRAPH }),
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["case-automations", caseId] });
      setSelectedId(created.id);
      const next: Draft = { name: created.name, graph: created.graph };
      setDraft(next);
      setBaseline(fingerprint(next));
      setNewOpen(false);
      setNewName("");
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
      qc.invalidateQueries({ queryKey: ["case-automations", caseId] });
      qc.invalidateQueries({ queryKey: ["automation", saved.id] });
      setError(null);
    },
    onError: (e: Error) => setError(e.message || "Could not save the automation."),
  });

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

  const canSave = !isGlobal && dirty && !nameError && !save.isPending;

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
            disabled={!draft || isGlobal}
          >
            <Trash2 size={14} />
            Clear
          </Button>
          <Button onClick={() => draft && save.mutate(draft)} disabled={!canSave}>
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
              This is a global automation, shared with every case.
            </span>{" "}
            <span className="text-white/60">
              Editing it here would change it for all cases, so it is read-only for now.
              Applying an automation to all cases, customizing a global for this case and
              reverting a customization are coming in the next step.
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
              disabled={isGlobal}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Renewal reminder"
            />
            {nameError && !isGlobal && (
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
        onClose={() => {
          setNewOpen(false);
          setNewName("");
        }}
        title="New automation"
        description="It belongs to this case only until you choose to apply it to all cases."
        widthClass="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              autoFocus
              value={newName}
              maxLength={NAME_MAX + 20}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Renewal reminder"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !newNameError) create.mutate(newNameTrimmed);
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
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => {
                setNewOpen(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate(newNameTrimmed)}
              disabled={!!newNameError || create.isPending}
            >
              {create.isPending ? "Creating…" : "Create"}
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
