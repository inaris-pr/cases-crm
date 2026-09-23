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
  CaseContact,
  CaseDetail as CaseDetailType,
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
import { cn } from "@/lib/cn";
import { formatDate, formatBytes, formatRelative } from "@/lib/format";

import { recordsPath } from "@/lib/records";
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
  const threadQ = useQuery({
    queryKey: ["case-thread", id],
    queryFn: () => fetchJson<CaseThreadEntry[]>(API(`/api/cases/${id}/thread`)),
    enabled: !Number.isNaN(id),
  });

  const patchCase = useMutation({
    mutationFn: (body: Partial<{ title: string; description: string; tags: string[]; status: CaseStatus; priority: CasePriority }>) =>
      fetchJson(API(`/api/cases/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  if (caseQ.isLoading)
    return <div className="text-sm text-white/40 py-12 text-center">Loading…</div>;
  if (!caseQ.data)
    return <div className="text-sm text-white/40 py-12 text-center">Case not found.</div>;

  const c = caseQ.data;

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
          </div>
          {editing ? (
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
        <button
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
        </button>
      </div>

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
          {(threadQ.data?.length ?? 0) > 0 && (
            <span className="text-white/40 ml-1.5 text-[11px]">{threadQ.data!.length}</span>
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
              editing={editing}
              onSave={(body) => patchCase.mutate(body)}
            />
          )}
          {tab === "contacts" && (
            <ContactsTab
              caseId={c.id}
              contacts={contactsQ.data ?? []}
              loading={contactsQ.isLoading}
            />
          )}
          {tab === "thread" && (
            <ThreadTab
              caseId={c.id}
              entries={threadQ.data ?? []}
              loading={threadQ.isLoading}
            />
          )}
          {tab === "tasks" && <TasksTab caseDetail={c} />}
          {tab === "documents" && <DocumentsTab caseDetail={c} />}
          {tab === "automations" && (
            <CaseAutomationsTab caseId={c.id} onDirtyChange={setAutomationsDirty} />
          )}
        </div>

        {/* Details sidebar — every tab except the automation workspace. */}
        {tab !== "automations" && (
          <div className="lg:col-span-1">
            <DetailsCard caseDetail={c} onChangeStatus={(s) => patchCase.mutate({ status: s })} onChangePriority={(p) => patchCase.mutate({ priority: p })} />
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

// ── Details sidebar ─────────────────────────────────────────────────────────
function DetailsCard({
  caseDetail,
  onChangeStatus,
  onChangePriority,
}: {
  caseDetail: CaseDetailType;
  onChangeStatus: (s: CaseStatus) => void;
  onChangePriority: (p: CasePriority) => void;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 space-y-4">
      <div className="label-eyebrow">Details</div>

      {caseDetail.customer && (
        <div>
          <div className="text-xs text-white/50 mb-0.5">Customer</div>
          <Link href={`/clients/${caseDetail.customer.id}`}>
            <a className="text-sm font-semibold text-white hover:underline inline-flex items-center gap-1.5">
              {caseDetail.customer.name}
              <ExternalLink size={11} className="text-white/40" />
            </a>
          </Link>
          {caseDetail.customer.company && (
            <div className="text-xs text-white/40 mt-0.5">{caseDetail.customer.company}</div>
          )}
        </div>
      )}

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
    </div>
  );
}

// ── Contacts ────────────────────────────────────────────────────────────────
function ContactsTab({
  caseId,
  contacts,
  loading,
}: {
  caseId: number;
  contacts: CaseContact[];
  loading: boolean;
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
      setContact("");
      setSummary("");
    },
  });

  return (
    <div className="space-y-4">
      <form
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
      </form>

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
}: {
  caseId: number;
  entries: CaseThreadEntry[];
  loading: boolean;
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
      // @-mentions create Mention notifications in the Tags inbox.
      qc.invalidateQueries({ queryKey: ["mentions"] });
      setBody("");
    },
  });

  return (
    <div className="space-y-4">
      <form
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
      </form>

      {loading ? (
        <div className="text-sm text-white/40 text-center py-6">Loading thread…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.025] p-10 text-center">
          <div className="size-12 rounded-2xl bg-white/5 grid place-items-center text-white/40 mx-auto mb-3">
            <MessageSquare size={20} />
          </div>
          <h3 className="text-base font-semibold mb-1">No thread updates yet</h3>
          <p className="text-sm text-white/50 max-w-sm mx-auto">
            Keep the team aligned by sharing case notes here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-white/8 bg-white/[0.025] p-4 flex items-start gap-3"
            >
              <Avatar name={entry.authorName} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{entry.authorName}</span>
                  <span className="text-[11px] text-white/40">
                    {formatRelative(entry.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-white/85 mt-1 leading-relaxed whitespace-pre-wrap">
                  <MentionBody body={entry.body} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────────
function TasksTab({ caseDetail }: { caseDetail: CaseDetailType }) {
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
              onClick={() => patch.mutate({ id: t.id, status: cycle(t.status) })}
              className="text-white/50 hover:text-[var(--color-primary)]"
              aria-label="Cycle status"
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

      <form
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
      </form>
    </div>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────
function DocumentsTab({ caseDetail }: { caseDetail: CaseDetailType }) {
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (filename && url) create.mutate();
        }}
        className="rounded-xl border border-white/8 bg-white/[0.025] p-4 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[160px]">
          <Label>Filename</Label>
          <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
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
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <Button type="submit" disabled={!filename || !url || create.isPending}>
          <Upload size={13} />
          Upload
        </Button>
      </form>
    </div>
  );
}
