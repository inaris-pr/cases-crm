import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Workflow as WorkflowIcon,
  ListTodo,
  FileText,
  CheckCircle2,
  Circle,
  Plus,
  Upload,
  PencilLine,
  Check,
  ArrowLeft,
  ExternalLink,
  Phone,
  Mail,
  MessageSquare,
  CalendarClock,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
} from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type {
  CaseCategory,
  CaseContact,
  CaseDetail as CaseDetailType,
  CaseFeed,
  FeedEntry,
  CasePriority,
  CaseStatus,
  CaseThreadEntry,
  ContactChannel,
  ContactDirection,
  TaskStatus,
  DocumentType,
  Doc,
  Task,
} from "@/lib/api";
import { StatusBadge, PriorityBadge, TaskStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { CaseAutomationsTab } from "@/components/automations/CaseAutomationsTab";
import { MentionBody, MentionTextarea } from "@/components/MentionInput";
import { useMyName } from "@/lib/auth";
import { useAccess } from "@/lib/useAccess";
import { caseControls, type CaseControls } from "@cases/access";
import { ReassignControl } from "@/components/ReassignControl";
import { CaseFeedList } from "@/components/cases/CaseFeed";
import {
  CaseHistoryCard,
  CategoryChip,
  CategoryField,
  ClosureInfo,
  EscalationBar,
  EscalationMarker,
} from "@/components/cases/CaseLifecycle";
import { cn } from "@/lib/cn";
import { formatDate, formatBytes, formatRelative } from "@/lib/format";

import { recordsPath } from "@/lib/records";
import { caseAccountLink, caseClientLink } from "@/lib/caseLinks";
// MY_NAME is now derived from the auth context inside each component that needs it.

const CHANNEL_META: Record<ContactChannel, { label: string; icon: any; color: string }> = {
  phone: { label: "Phone", icon: Phone, color: "#3b82f6" },
  email: { label: "Email", icon: Mail, color: "#a855f7" },
  sms: { label: "SMS", icon: MessageSquare, color: "#29f312" },
  meeting: { label: "Meeting", icon: CalendarClock, color: "#f59e0b" },
  other: { label: "Other", icon: MessageSquare, color: "#94a3b8" },
};

type Tab = "overview" | "contacts" | "thread" | "tasks" | "documents" | "automations";

const VALID_TABS: Tab[] = ["overview", "contacts", "thread", "tasks", "documents", "automations"];

/** Retired tab ids, so older deep links still land somewhere sensible. */
const TAB_ALIASES: Record<string, Tab> = { workflow: "automations" };

function initialTabFromHash(): Tab {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace(/^#/, "").toLowerCase();
  if (h in TAB_ALIASES) return TAB_ALIASES[h];
  return (VALID_TABS as string[]).includes(h) ? (h as Tab) : "overview";
}

export function CaseDetail() {
  const params = useParams();
  const id = Number(params.id);
  const qc = useQueryClient();
  const access = useAccess();
  const [tab, setTab] = useState<Tab>(initialTabFromHash);
  const [editing, setEditing] = useState(false);

  // The Automations tab edits a graph that is only persisted on Save, so
  // leaving it with unsaved work needs a confirmation. CaseAutomationsTab
  // reports its own dirty state because it cannot see the tab strip; the
  // component guards page unload itself.
  const [automationsDirty, setAutomationsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const blockingRef = useRef(false);
  blockingRef.current = tab === "automations" && automationsDirty;

  function requestTab(next: Tab) {
    if (next === tab) return;
    if (blockingRef.current) {
      setPendingTab(next);
      return;
    }
    if (tab === "automations") setAutomationsDirty(false);
    setTab(next);
  }

  function discardAndSwitchTab() {
    if (pendingTab !== null) {
      setAutomationsDirty(false);
      setTab(pendingTab);
    }
    setPendingTab(null);
  }

  // Re-sync the tab if the user hits the back/forward button or another
  // dashboard link pushes a different hash.
  useEffect(() => {
    const onHashChange = () => {
      const next = initialTabFromHash();
      if (blockingRef.current) setPendingTab(next);
      else setTab(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const caseQ = useQuery({
    queryKey: ["case", id],
    queryFn: () => fetchJson<CaseDetailType>(API(`/api/cases/${id}`)),
  });
  const contactsQ = useQuery({
    queryKey: ["case-contacts", id],
    queryFn: () => fetchJson<CaseContact[]>(API(`/api/cases/${id}/contacts`)),
    enabled: !Number.isNaN(id),
  });
  // The unified Thread (comments + system activity), merged by the server.
  // Keyed under ["case", id] so every case mutation that refreshes the case
  // refreshes the timeline too.
  const feedQ = useQuery({
    queryKey: ["case", id, "feed"],
    queryFn: () => fetchJson<CaseFeed>(API(`/api/cases/${id}/feed`)),
    enabled: !Number.isNaN(id),
  });

  const patchCase = useMutation({
    mutationFn: (
      body: Partial<{
        title: string;
        description: string;
        tags: string[];
        status: CaseStatus;
        priority: CasePriority;
        category: CaseCategory | null;
      }>,
    ) =>
      fetchJson(API(`/api/cases/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (caseQ.isLoading)
    return <div className="text-sm text-white/40 py-12 text-center">Loading…</div>;
  if (!caseQ.data)
    return <div className="text-sm text-white/40 py-12 text-center">Case not found.</div>;

  const c = caseQ.data;
  // What this employee may do on THIS case (RBAC Phase 5; the API decides too).
  const ctl = caseControls(access, c);

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link href={recordsPath("cases")}>
        <a className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white">
          <ArrowLeft size={11} />
          Back to Cases
        </a>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-1.5 mb-2">
            <span className="font-mono text-[10px] tracking-wider text-white/60 bg-white/5 border border-white/10 rounded-md px-2 py-0.5 uppercase">
              {c.caseNumber}
            </span>
            <StatusBadge
              status={c.status}
              className="!text-[10px] !px-2 !py-0.5 uppercase tracking-wider"
            />
            <PriorityBadge
              priority={c.priority}
              className="!text-[10px] !px-2 !py-0.5 uppercase tracking-wider"
            />
            <CategoryChip category={c.category} />
            <EscalationMarker escalation={c.activeEscalation} />
          </div>
          {editing && ctl.edit ? (
            <Input
              value={c.title}
              autoFocus
              onChange={(e) => patchCase.mutate({ title: e.target.value })}
              className="!text-2xl !h-auto !py-1.5 !font-bold !tracking-tight bg-transparent border-0 border-b border-white/10 rounded-none focus:!shadow-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{c.title}</h1>
          )}
        </div>
        {ctl.edit && (<button
          onClick={() => setEditing(!editing)}
          className={cn(
            "size-8 grid place-items-center rounded-lg border transition-colors",
            editing
              ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-white/10 text-white/50 hover:text-white hover:bg-white/5",
          )}
          aria-label={editing ? "Done editing" : "Edit case"}
          title={editing ? "Done editing" : "Edit case"}
        >
          {editing ? <Check size={13} /> : <PencilLine size={13} />}
        </button>)}
      </div>

      {/* Escalation (Phase 7): the active one, or Escalate when permitted. */}
      <EscalationBar caseDetail={c} canEscalate={ctl.escalate} canResolve={ctl.resolveEscalation} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto">
        <TabBtn active={tab === "overview"} onClick={() => requestTab("overview")} icon={Layers}>
          Overview
        </TabBtn>
        <TabBtn active={tab === "contacts"} onClick={() => requestTab("contacts")} icon={Phone}>
          Contacts
          {(contactsQ.data?.length ?? 0) > 0 && (
            <span className="text-white/40 ml-1.5 text-[11px]">{contactsQ.data!.length}</span>
          )}
        </TabBtn>
        <TabBtn active={tab === "thread"} onClick={() => requestTab("thread")} icon={MessageSquare}>
          Thread
          {(feedQ.data?.count ?? 0) > 0 && (
            <span className="text-white/40 ml-1.5 text-[11px]" data-testid="thread-count">{feedQ.data!.count}</span>
          )}
        </TabBtn>
        <TabBtn active={tab === "tasks"} onClick={() => requestTab("tasks")} icon={ListTodo}>
          Tasks
          {c.tasks.length > 0 && (
            <span className="text-white/40 ml-1.5 text-[11px]">{c.tasks.length}</span>
          )}
        </TabBtn>
        <TabBtn active={tab === "documents"} onClick={() => requestTab("documents")} icon={FileText}>
          Documents
          {c.documents.length > 0 && (
            <span className="text-white/40 ml-1.5 text-[11px]">{c.documents.length}</span>
          )}
        </TabBtn>
        <TabBtn active={tab === "automations"} onClick={() => requestTab("automations")} icon={WorkflowIcon}>
          Automations
        </TabBtn>
      </div>

      {/* Content. The automation workspace takes the full case width — the
          builder canvas is unusable squeezed beside the details card. */}
      <div className={cn("grid grid-cols-1 gap-4", tab !== "automations" && "lg:grid-cols-3")}>
        <div className={cn("space-y-5", tab !== "automations" && "lg:col-span-2")}>
          {tab === "overview" && (
            <OverviewTab
              caseDetail={c}
              editing={editing && ctl.edit}
              onSave={(body) => patchCase.mutate(body)}
            />
          )}
          {tab === "contacts" && (
            <ContactsTab
              caseId={c.id}
              contacts={contactsQ.data ?? []}
              loading={contactsQ.isLoading}
              canWork={ctl.work}
            />
          )}
          {tab === "thread" && (
            <ThreadTab
              caseId={c.id}
              entries={feedQ.data?.entries ?? []}
              loading={feedQ.isLoading}
              canWork={ctl.work}
              onViewCalls={() => requestTab("contacts")}
            />
          )}
          {tab === "tasks" && <TasksTab caseDetail={c} canWork={ctl.work} />}
          {tab === "documents" && <DocumentsTab caseDetail={c} canWork={ctl.work} />}
          {tab === "automations" && (
            <CaseAutomationsTab
              caseId={c.id}
              onDirtyChange={setAutomationsDirty}
              canEdit={ctl.editAutomations}
              canManageGlobal={ctl.manageGlobalAutomations}
            />
          )}
        </div>

        {/* Details sidebar — every tab except the automation workspace. */}
        {tab !== "automations" && (
          <div className="lg:col-span-1 space-y-4">
            <DetailsCard
              caseDetail={c}
              controls={ctl}
              onChangeStatus={(s) => patchCase.mutate({ status: s })}
              onChangePriority={(p) => patchCase.mutate({ priority: p })}
              onChangeCategory={(cat) => patchCase.mutate({ category: cat })}
            />
            <CaseHistoryCard caseDetail={c} />
          </div>
        )}
      </div>

      <Modal
        open={pendingTab !== null}
        onClose={() => setPendingTab(null)}
        title="Discard unsaved changes?"
        description="This automation has edits that have not been saved. Leaving the Automations tab will lose them."
        widthClass="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingTab(null)}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={discardAndSwitchTab}>
            Discard and leave
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Tab btn ─────────────────────────────────────────────────────────────────
function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2.5 text-xs -mb-px border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap",
        active
          ? "border-[var(--color-primary)] text-[var(--color-primary)] font-semibold"
          : "border-transparent text-white/45 hover:text-white",
      )}
    >
      <Icon size={11} />
      {children}
    </button>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewTab({
  caseDetail,
  editing,
  onSave,
}: {
  caseDetail: CaseDetailType;
  editing: boolean;
  onSave: (body: Partial<{ description: string; tags: string[] }>) => void;
}) {
  const [description, setDescription] = useState(caseDetail.description ?? "");
  const [tags, setTags] = useState(caseDetail.tags.join(", "));

  // Reset local edits whenever the case data changes (e.g., another tab saved).
  useEffect(() => {
    setDescription(caseDetail.description ?? "");
    setTags(caseDetail.tags.join(", "));
  }, [caseDetail.id, caseDetail.description, caseDetail.tags]);

  function commitDescription() {
    if (description !== (caseDetail.description ?? "")) {
      onSave({ description });
    }
  }
  function commitTags() {
    const list = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (list.join(",") !== caseDetail.tags.join(",")) {
      onSave({ tags: list });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <h3 className="text-base font-semibold tracking-tight mb-3">Description</h3>
        {editing ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            rows={5}
            className="bg-black/30"
            placeholder="Describe the matter…"
          />
        ) : (
          <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
            {caseDetail.description?.trim() || "No description yet."}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <h3 className="text-base font-semibold tracking-tight mb-3">Tags</h3>
        {editing ? (
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={commitTags}
            placeholder="comma, separated, tags"
          />
        ) : caseDetail.tags.length === 0 ? (
          <p className="text-xs text-white/40">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {caseDetail.tags.map((t) => (
              <span
                key={t}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-white/80 border border-white/10"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client / Account links ──────────────────────────────────────────────────
// Each link is built from its own id (primaryContactId / accountId) by
// lib/caseLinks — never from the legacy `customer` projection, whose id is
// the Account id.
function CaseRecordLinks({ caseDetail }: { caseDetail: CaseDetailType }) {
  const client = caseClientLink(caseDetail);
  const account = caseAccountLink(caseDetail);
  const linkClass =
    "text-sm font-semibold text-white hover:underline inline-flex items-center gap-1.5";
  return (
    <>
      <div data-testid="case-client">
        <div className="text-xs text-white/50 mb-0.5">Client</div>
        {client.kind === "linked" ? (
          <Link href={client.link.href}>
            <a className={linkClass} title="Open client">
              {client.link.label}
              <ExternalLink size={11} className="text-white/40" />
            </a>
          </Link>
        ) : client.kind === "unresolved" ? (
          <div className="text-sm text-white/50" title="This contact record could not be found">
            {client.label} <span className="text-xs text-white/35">(not found)</span>
          </div>
        ) : (
          <div className="text-sm text-white/40">No primary contact</div>
        )}
      </div>

      <div data-testid="case-account">
        <div className="text-xs text-white/50 mb-0.5">Account</div>
        <Link href={account.href}>
          <a className={linkClass} title="Open account">
            {account.label}
            <ExternalLink size={11} className="text-white/40" />
          </a>
        </Link>
      </div>
    </>
  );
}

// ── Details sidebar ─────────────────────────────────────────────────────────
function DetailsCard({
  caseDetail,
  controls,
  onChangeStatus,
  onChangePriority,
  onChangeCategory,
}: {
  caseDetail: CaseDetailType;
  controls: CaseControls;
  onChangeStatus: (s: CaseStatus) => void;
  onChangePriority: (p: CasePriority) => void;
  onChangeCategory: (c: CaseCategory | null) => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 space-y-4">
      <div className="label-eyebrow">Details</div>

      <CaseRecordLinks caseDetail={caseDetail} />

      <div>
        <div className="text-xs text-white/50 mb-0.5">Owner</div>
        <ReassignControl
          type="cases"
          recordId={caseDetail.id}
          ownerName={caseDetail.ownerName}
          ownerUserId={caseDetail.ownerUserId}
          canReassign={controls.reassign}
          invalidate={[["case", caseDetail.id], ["cases"]]}
        />
      </div>

      <div>
        <div className="text-xs text-white/50 mb-0.5">Created At</div>
        <div className="text-sm font-semibold text-white">
          {formatDate(caseDetail.createdAt, { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <div>
        <div className="text-xs text-white/50 mb-0.5">Last Updated</div>
        <div className="text-sm font-semibold text-white">
          {formatDate(caseDetail.updatedAt, { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <ClosureInfo caseDetail={caseDetail} />

      <CategoryField category={caseDetail.category} canEdit={controls.edit} onChange={onChangeCategory} />

      {/* Status and priority are edits (cases.edit); read-only otherwise. */}
      {!controls.edit && (
        <div className="border-t border-white/5 pt-4 flex items-center gap-2">
          <StatusBadge status={caseDetail.status} />
          <PriorityBadge priority={caseDetail.priority} />
        </div>
      )}
      {controls.edit && (
      <div className="border-t border-white/5 pt-4 space-y-2.5">
        <div>
          <Label>Status</Label>
          <Select
            value={caseDetail.status}
            onChange={(e) => onChangeStatus(e.target.value as CaseStatus)}
          >
            <option value="intake">Open</option>
            <option value="in_progress">Working</option>
            <option value="review">Pending Customer</option>
            <option value="waiting">Waiting on 3rd Party</option>
            <option value="completed">Closed</option>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select
            data-testid="case-priority-select"
            value={caseDetail.priority}
            onChange={(e) => onChangePriority(e.target.value as CasePriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
      </div>
      )}
    </div>
  );
}

// ── Contacts ────────────────────────────────────────────────────────────────
function ContactsTab({
  caseId,
  contacts,
  loading,
  canWork,
}: {
  caseId: number;
  contacts: CaseContact[];
  loading: boolean;
  /** Logging calls needs cases.work on this case. */
  canWork: boolean;
}) {
  const qc = useQueryClient();
  const MY_NAME = useMyName();
  const [direction, setDirection] = useState<ContactDirection>("outbound");
  const [channel, setChannel] = useState<ContactChannel>("email");
  const [contact, setContact] = useState("");
  const [summary, setSummary] = useState("");

  const log = useMutation({
    mutationFn: () =>
      fetchJson<CaseContact>(API(`/api/cases/${caseId}/contacts`), {
        method: "POST",
        body: JSON.stringify({
          direction,
          channel,
          contact: contact.trim(),
          summary: summary.trim(),
          byName: MY_NAME,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case-contacts", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId, "feed"] });
      setContact("");
      setSummary("");
    },
  });

  return (
    <div className="space-y-4">
      {canWork && (<form
        onSubmit={(e) => {
          e.preventDefault();
          if (contact.trim() && summary.trim()) log.mutate();
        }}
        className="rounded-xl border border-white/8 bg-white/[0.025] p-4 space-y-3"
      >
        <h3 className="text-base font-semibold tracking-tight">Log a contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Direction</Label>
            <Select
              data-testid="contact-direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as ContactDirection)}
            >
              <option value="outbound">Outbound — we reached out</option>
              <option value="inbound">Inbound — client reached out</option>
            </Select>
          </div>
          <div>
            <Label>Channel</Label>
            <Select
              data-testid="contact-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as ContactChannel)}
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="meeting">Meeting</option>
              <option value="other">Other</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Contact name</Label>
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Who from the client side?"
          />
        </div>
        <div>
          <Label>Summary</Label>
          <Textarea
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What was discussed?"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!contact.trim() || !summary.trim() || log.isPending}
          >
            {log.isPending ? "Saving…" : "Log contact"}
          </Button>
        </div>
      </form>)}

      {loading ? (
        <div className="text-sm text-white/40 text-center py-6">Loading contacts…</div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.025] p-10 text-center">
          <div className="size-12 rounded-2xl bg-white/5 grid place-items-center text-white/40 mx-auto mb-3">
            <Phone size={20} />
          </div>
          <h3 className="text-base font-semibold mb-1">No contact attempts yet</h3>
          <p className="text-sm text-white/50 max-w-sm mx-auto">
            Use the form above to log the first call, email, or meeting.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((cnt) => {
            const ch = CHANNEL_META[cnt.channel];
            const ChIcon = ch.icon;
            const DirIcon = cnt.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
            return (
              <div
                key={cnt.id}
                className="rounded-xl border border-white/8 bg-white/[0.025] p-4 flex items-start gap-3"
              >
                <div
                  className="size-10 rounded-xl grid place-items-center shrink-0"
                  style={{ background: `${ch.color}15`, color: ch.color }}
                >
                  <ChIcon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: ch.color }}
                    >
                      <DirIcon size={11} />
                      {cnt.direction === "inbound" ? "Inbound" : "Outbound"} · {ch.label}
                    </span>
                    <span className="text-white/40">·</span>
                    <span className="text-white/60">{cnt.contact}</span>
                    <span className="ml-auto text-white/40">
                      {formatRelative(cnt.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-white/90 mt-1.5 leading-relaxed">
                    {cnt.summary}
                  </div>
                  <div className="text-[11px] text-white/40 mt-1.5">
                    Logged by {cnt.byName}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Thread ──────────────────────────────────────────────────────────────────
function ThreadTab({
  caseId,
  entries,
  loading,
  canWork,
  onViewCalls,
}: {
  caseId: number;
  /** The unified feed: comments and system activity, oldest first. */
  entries: FeedEntry[];
  loading: boolean;
  /** Commenting needs cases.work on this case. */
  canWork: boolean;
  /** Opens the detailed call log (Contacts tab). */
  onViewCalls: () => void;
}) {
  const qc = useQueryClient();
  const MY_NAME = useMyName();
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: () =>
      fetchJson<CaseThreadEntry>(API(`/api/cases/${caseId}/thread`), {
        method: "POST",
        body: JSON.stringify({ authorName: MY_NAME, body: body.trim() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case-thread", caseId] });
      qc.invalidateQueries({ queryKey: ["case", caseId, "feed"] });
      // @-mentions create Mention notifications in the Tags inbox.
      qc.invalidateQueries({ queryKey: ["mentions"] });
      setBody("");
    },
  });

  return (
    <div className="space-y-4">
      {canWork && (<form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate();
        }}
        className="rounded-xl border border-white/8 bg-white/[0.025] p-4 space-y-3"
      >
        <h3 className="text-base font-semibold tracking-tight">Post a team update</h3>
        <MentionTextarea
          rows={3}
          value={body}
          onChange={setBody}
          onSubmit={() => body.trim() && post.mutate()}
          placeholder="Share a note with the team about this case… (type @ to mention a teammate)"
          excludeName={MY_NAME}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/30">⌘/Ctrl + Enter to post · @-mentions send a DM</span>
          <Button type="submit" disabled={!body.trim() || post.isPending}>
            <Send size={13} />
            {post.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </form>)}

      {loading ? (
        <div className="text-sm text-white/40 text-center py-6">Loading thread…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.025] p-10 text-center">
          <div className="size-12 rounded-2xl bg-white/5 grid place-items-center text-white/40 mx-auto mb-3">
            <MessageSquare size={20} />
          </div>
          <h3 className="text-base font-semibold mb-1">No activity yet</h3>
          <p className="text-sm text-white/50 max-w-sm mx-auto">
            Comments and case activity — status, tasks, documents, calls, escalations — appear here.
          </p>
        </div>
      ) : (
        <CaseFeedList entries={entries} onViewCalls={onViewCalls} />
      )}
    </div>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────────
function TasksTab({ caseDetail, canWork }: { caseDetail: CaseDetailType; canWork: boolean }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: () =>
      fetchJson<Task>(API("/api/tasks"), {
        method: "POST",
        body: JSON.stringify({
          caseId: caseDetail.id,
          title: newTitle,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseDetail.id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setNewTitle("");
      setDueDate("");
    },
  });

  const patch = useMutation({
    mutationFn: (vars: { id: number; status: TaskStatus }) =>
      fetchJson(API(`/api/tasks/${vars.id}`), {
        method: "PATCH",
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case", caseDetail.id] }),
  });

  const cycle = (s: TaskStatus): TaskStatus =>
    s === "pending" ? "in_progress" : s === "in_progress" ? "completed" : "pending";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/8 bg-white/[0.025] overflow-hidden divide-y divide-white/5">
        {caseDetail.tasks.length === 0 && (
          <div className="p-8 text-center text-sm text-white/40">No tasks yet.</div>
        )}
        {caseDetail.tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3.5">
            <button
              onClick={() => canWork && patch.mutate({ id: t.id, status: cycle(t.status) })}
              disabled={!canWork}
              className="text-white/50 hover:text-[var(--color-primary)] disabled:hover:text-white/50 disabled:cursor-default"
              aria-label="Cycle status"
              data-testid={`task-cycle-${t.id}`}
            >
              {t.status === "completed" ? (
                <CheckCircle2 size={18} className="text-[var(--color-primary)]" />
              ) : (
                <Circle size={18} />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-sm",
                  t.status === "completed" && "line-through text-white/40",
                )}
              >
                {t.title}
              </div>
              <div className="text-xs text-white/40">Due {formatDate(t.dueDate)}</div>
            </div>
            <TaskStatusBadge status={t.status} />
          </div>
        ))}
      </div>

      {canWork && (<form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim()) create.mutate();
        }}
        className="rounded-xl border border-white/8 bg-white/[0.025] p-3 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[200px]">
          <Label>New task</Label>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Describe the task…"
          />
        </div>
        <div>
          <Label>Due</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <Button type="submit" disabled={!newTitle.trim() || create.isPending}>
          <Plus size={13} />
          Add
        </Button>
      </form>)}
    </div>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────
function DocumentsTab({ caseDetail, canWork }: { caseDetail: CaseDetailType; canWork: boolean }) {
  const qc = useQueryClient();
  const [filename, setFilename] = useState("");
  const [type, setType] = useState<DocumentType>("contract");
  const [url, setUrl] = useState("");

  const create = useMutation({
    mutationFn: () =>
      fetchJson<Doc>(API("/api/documents"), {
        method: "POST",
        body: JSON.stringify({
          caseId: caseDetail.id,
          filename,
          fileUrl: url,
          type,
          size: 0,
          tags: [],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseDetail.id] });
      setFilename("");
      setUrl("");
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {caseDetail.documents.length === 0 && (
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-8 col-span-full text-center text-sm text-white/40">
            No documents attached.
          </div>
        )}
        {caseDetail.documents.map((d) => (
          <a
            key={d.id}
            href={d.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/8 bg-white/[0.025] p-4 flex items-start gap-3 hover:bg-white/[0.06] transition-colors"
          >
            <div className="size-10 grid place-items-center rounded-lg bg-amber-500/15 text-amber-400">
              <FileText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{d.filename}</div>
              <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
                <span className="capitalize">{d.type}</span>
                <span>·</span>
                <span>{formatBytes(d.size)}</span>
                <span>·</span>
                <span>{formatDate(d.createdAt)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
      {canWork && (<form
        onSubmit={(e) => {
          e.preventDefault();
          if (filename && url) create.mutate();
        }}
        className="rounded-xl border border-white/8 bg-white/[0.025] p-4 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[160px]">
          <Label>Filename</Label>
          <Input data-testid="document-filename" value={filename} onChange={(e) => setFilename(e.target.value)} />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            <option value="contract">Contract</option>
            <option value="invoice">Invoice</option>
            <option value="report">Report</option>
            <option value="identity">Identity</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <Label>URL</Label>
          <Input data-testid="document-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <Button type="submit" disabled={!filename || !url || create.isPending}>
          <Upload size={13} />
          Upload
        </Button>
      </form>)}
    </div>
  );
}
