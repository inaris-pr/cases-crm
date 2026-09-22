import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Circle,
  Clock,
  AlertCircle,
  XCircle,
  ChevronDown,
  Layers,
  Phone,
  Mail,
  MessageSquare,
  CalendarClock,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Upload,
  Send,
  ExternalLink,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { API, fetchJson } from "@/lib/api";
import type {
  Case,
  CaseContact,
  CaseStatus,
  CaseThreadEntry,
  CaseWithCustomer,
  ContactChannel,
  ContactDirection,
  Doc,
  DocumentType,
  Task,
} from "@/lib/api";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { PriorityBadge } from "@/components/ui/Badge";
import { MentionBody, MentionTextarea } from "@/components/MentionInput";
import { cn } from "@/lib/cn";
import { formatDate, formatRelative, formatBytes } from "@/lib/format";
import { useMyName } from "@/lib/auth";

const STATUS_META: Record<
  CaseStatus,
  { label: string; icon: any; color: string }
> = {
  intake: { label: "Open", icon: Circle, color: "#3b82f6" },
  in_progress: { label: "Working", icon: Clock, color: "#29f312" },
  review: { label: "Pending Customer", icon: Clock, color: "#a855f7" },
  waiting: { label: "Waiting on 3rd Party", icon: AlertCircle, color: "#f59e0b" },
  completed: { label: "Closed", icon: XCircle, color: "#ef4444" },
};

const CHANNEL_META: Record<ContactChannel, { label: string; icon: any; color: string }> = {
  phone: { label: "Phone", icon: Phone, color: "#3b82f6" },
  email: { label: "Email", icon: Mail, color: "#a855f7" },
  sms: { label: "SMS", icon: MessageSquare, color: "#29f312" },
  meeting: { label: "Meeting", icon: CalendarClock, color: "#f59e0b" },
  other: { label: "Other", icon: MessageSquare, color: "#94a3b8" },
};

interface CaseDetailFull extends CaseWithCustomer {
  tasks: Task[];
  documents: Doc[];
}

type Tab = "overview" | "contacts" | "documents" | "thread";

export function CaseDetailModal({
  caseId,
  onClose,
}: {
  caseId: number | null;
  onClose: () => void;
}) {
  const open = caseId != null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && caseId != null ? (
        <motion.div
          className="fixed inset-0 z-50 flex p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative m-auto w-full max-w-xl max-h-[85vh] glass-panel rounded-xl overflow-hidden flex flex-col shadow-2xl"
            style={{
              boxShadow: "0 20px 50px rgba(0,0,0,0.55), 0 0 40px rgba(41,243,18,0.06)",
            }}
          >
            <div
              className="h-[2px] shrink-0"
              style={{ background: "linear-gradient(90deg, #3b82f6, #a855f7, #29f312)" }}
            />
            <Inner caseId={caseId} onClose={onClose} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Inner({ caseId, onClose }: { caseId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const MY_NAME = useMyName();
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => setTab("overview"), [caseId]);

  const caseQuery = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchJson<CaseDetailFull>(API(`/api/cases/${caseId}`)),
  });
  const contactsQuery = useQuery({
    queryKey: ["case-contacts", caseId],
    queryFn: () => fetchJson<CaseContact[]>(API(`/api/cases/${caseId}/contacts`)),
  });
  const threadQuery = useQuery({
    queryKey: ["case-thread", caseId],
    queryFn: () => fetchJson<CaseThreadEntry[]>(API(`/api/cases/${caseId}/thread`)),
  });

  const patchCase = useMutation({
    mutationFn: (body: Partial<Case>) =>
      fetchJson(API(`/api/cases/${caseId}`), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const c = caseQuery.data;
  if (!c) {
    return (
      <div className="flex-1 grid place-items-center text-xs text-white/40 p-10">
        Loading…
      </div>
    );
  }
  const meta = STATUS_META[c.status];

  const contactCount = contactsQuery.data?.length ?? 0;
  const documentCount = c.documents?.length ?? 0;
  const threadCount = threadQuery.data?.length ?? 0;

  return (
    <>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
              {c.caseNumber} · {meta.label}
            </div>
            <h2 className="text-lg font-bold tracking-tight mt-0.5 truncate">{c.title}</h2>
            {c.description && (
              <p className="text-xs text-white/50 mt-0.5 line-clamp-1">{c.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusPill status={c.status} onChange={(s) => patchCase.mutate({ status: s })} />
            <button
              onClick={onClose}
              className="size-7 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/5 border border-white/5"
              aria-label="Close"
            >
              <X size={13} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/40 mt-2">
          <span>
            Opened by <span className="text-white/70">{MY_NAME}</span>
          </span>
          <span>·</span>
          <span>{formatDate(c.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span>
          <span className="ml-auto">
            <PriorityBadge priority={c.priority} className="!text-[10px] !px-1.5 !py-0.5" />
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 px-5 border-b border-white/5 shrink-0">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={Layers}>
          Overview
        </TabBtn>
        <TabBtn active={tab === "contacts"} onClick={() => setTab("contacts")} icon={Phone}>
          Contacts
          {contactCount > 0 && <span className="text-white/35 ml-1">{contactCount}</span>}
        </TabBtn>
        <TabBtn active={tab === "documents"} onClick={() => setTab("documents")} icon={FileText}>
          Documents
          {documentCount > 0 && <span className="text-white/35 ml-1">{documentCount}</span>}
        </TabBtn>
        <TabBtn active={tab === "thread"} onClick={() => setTab("thread")} icon={MessageSquare}>
          Thread
          {threadCount > 0 && <span className="text-white/35 ml-1">{threadCount}</span>}
        </TabBtn>
      </div>

      {/* Tab content */}
      <div className="px-5 py-3.5 overflow-y-auto flex-1">
        {tab === "overview" && (
          <OverviewTab
            caseDetail={c}
            contactCount={contactCount}
            threadCount={threadCount}
          />
        )}
        {tab === "contacts" && (
          <ContactsTab
            caseId={caseId}
            contacts={contactsQuery.data ?? []}
            loading={contactsQuery.isLoading}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab caseId={caseId} documents={c.documents ?? []} />
        )}
        {tab === "thread" && (
          <ThreadTab
            caseId={caseId}
            entries={threadQuery.data ?? []}
            loading={threadQuery.isLoading}
          />
        )}
      </div>
    </>
  );
}

function StatusPill({
  status,
  onChange,
}: {
  status: CaseStatus;
  onChange: (s: CaseStatus) => void;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-semibold transition"
        style={{
          background: `${meta.color}1a`,
          borderColor: `${meta.color}55`,
          color: meta.color,
        }}
      >
        <Icon size={11} />
        {meta.label}
        <ChevronDown size={11} className="opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 glass-panel border border-white/10 rounded-md p-1 z-10 shadow-xl">
          {(Object.keys(STATUS_META) as CaseStatus[]).map((s) => {
            const sm = STATUS_META[s];
            const SIcon = sm.icon;
            const selected = s === status;
            return (
              <button
                key={s}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-colors",
                  selected
                    ? "text-white bg-white/5"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <span style={{ color: sm.color }}>
                  <SIcon size={11} />
                </span>
                {sm.label}
                {selected && <span className="ml-auto size-1 rounded-full bg-white/70" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
        "px-3 py-2.5 text-xs -mb-px border-b-2 flex items-center gap-1.5 transition-colors",
        active
          ? "border-[var(--color-primary)] text-white font-semibold"
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
  contactCount,
  threadCount,
}: {
  caseDetail: CaseDetailFull;
  contactCount: number;
  threadCount: number;
}) {
  const meta = STATUS_META[caseDetail.status];
  const customer = caseDetail.customer;
  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3">
        <div className="label-eyebrow mb-1.5">Case description</div>
        <p className="text-[13px] text-white/85 leading-relaxed whitespace-pre-wrap">
          {caseDetail.description?.trim() || "No description yet."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Status" value={meta.label} color={meta.color} />
        <Stat
          label="Client"
          value={customer?.name ?? "—"}
          color="#3b82f6"
          link={customer ? `/clients/${customer.id}` : undefined}
        />
        <Stat label="Contacts" value={contactCount} color="#a855f7" />
        <Stat label="Documents" value={caseDetail.documents.length} color="#f59e0b" />
        <Stat label="Thread entries" value={threadCount} color="#29f312" />
        <Stat
          label="Opened"
          value={formatDate(caseDetail.createdAt, { month: "short", day: "numeric" })}
          color="#94a3b8"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  link,
}: {
  label: string;
  value: string | number;
  color: string;
  link?: string;
}) {
  const inner = (
    <>
      <div className="label-eyebrow">{label}</div>
      <div
        className="text-sm font-semibold mt-1 tabular-nums truncate"
        style={
          typeof value === "number"
            ? { color }
            : value === "—"
              ? { color: "rgba(255,255,255,0.4)" }
              : { color }
        }
      >
        {value}
      </div>
    </>
  );
  if (link) {
    return (
      <Link href={link}>
        <a className="block rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 hover:bg-white/[0.06] transition-colors">
          {inner}
        </a>
      </Link>
    );
  }
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">{inner}</div>
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
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (contact.trim() && summary.trim()) log.mutate();
        }}
        className="rounded-lg border border-white/8 bg-white/[0.025] p-3 space-y-2"
      >
        <div className="label-eyebrow">Log a contact</div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as ContactDirection)}
          >
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </Select>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="meeting">Meeting</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Contact name (who on the client side?)"
        />
        <Textarea
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Summary…"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={!contact.trim() || !summary.trim() || log.isPending}
          >
            {log.isPending ? "Saving…" : "Log contact"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="text-[11px] text-white/40 text-center py-4">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-5 text-center">
          <Phone size={16} className="mx-auto text-white/30 mb-1.5" />
          <div className="text-xs text-white/55 font-semibold">No contact attempts yet</div>
          <div className="text-[11px] text-white/35 mt-0.5">
            Log the first call, email, or meeting above.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((cnt) => {
            const ch = CHANNEL_META[cnt.channel];
            const ChIcon = ch.icon;
            const DirIcon = cnt.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
            return (
              <div
                key={cnt.id}
                className="rounded-lg border border-white/8 bg-white/[0.025] p-2.5 flex items-start gap-2.5"
              >
                <div
                  className="size-7 rounded-md grid place-items-center shrink-0"
                  style={{ background: `${ch.color}15`, color: ch.color }}
                >
                  <ChIcon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: ch.color }}
                    >
                      <DirIcon size={10} />
                      {cnt.direction === "inbound" ? "In" : "Out"} · {ch.label}
                    </span>
                    <span className="text-white/30">·</span>
                    <span className="text-white/60">{cnt.contact}</span>
                    <span className="ml-auto text-white/35">
                      {formatRelative(cnt.createdAt)}
                    </span>
                  </div>
                  <div className="text-[13px] text-white/90 mt-1 leading-snug">
                    {cnt.summary}
                  </div>
                  <div className="text-[10px] text-white/30 mt-0.5">by {cnt.byName}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────
function DocumentsTab({
  caseId,
  documents,
}: {
  caseId: number;
  documents: Doc[];
}) {
  const qc = useQueryClient();
  const [filename, setFilename] = useState("");
  const [type, setType] = useState<DocumentType>("contract");
  const [url, setUrl] = useState("");
  const upload = useMutation({
    mutationFn: () =>
      fetchJson<Doc>(API("/api/documents"), {
        method: "POST",
        body: JSON.stringify({
          caseId,
          filename: filename.trim(),
          fileUrl: url.trim(),
          type,
          size: 0,
          tags: [],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      setFilename("");
      setUrl("");
    },
  });
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (filename.trim() && url.trim()) upload.mutate();
        }}
        className="rounded-lg border border-white/8 bg-white/[0.025] p-3 grid grid-cols-4 gap-2 items-end"
      >
        <div className="col-span-2">
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="Filename"
          />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
          <option value="contract">Contract</option>
          <option value="invoice">Invoice</option>
          <option value="report">Report</option>
          <option value="identity">Identity</option>
          <option value="other">Other</option>
        </Select>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" />
        <div className="col-span-4 flex justify-end">
          <Button
            size="sm"
            type="submit"
            disabled={!filename.trim() || !url.trim() || upload.isPending}
          >
            <Upload size={12} />
            {upload.isPending ? "Uploading…" : "Add"}
          </Button>
        </div>
      </form>
      {documents.length === 0 ? (
        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-5 text-center">
          <FileText size={16} className="mx-auto text-white/30 mb-1.5" />
          <div className="text-xs text-white/55 font-semibold">No documents yet</div>
          <div className="text-[11px] text-white/35 mt-0.5">
            Attach contracts, invoices, or reports.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {documents.map((d) => (
            <a
              key={d.id}
              href={d.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/8 bg-white/[0.025] p-2.5 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors group"
            >
              <div className="size-7 rounded-md bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                <FileText size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white truncate">{d.filename}</div>
                <div className="text-[10px] text-white/35 mt-0.5 flex items-center gap-1.5">
                  <span className="capitalize">{d.type}</span>
                  <span>·</span>
                  <span>{formatBytes(d.size)}</span>
                  <span>·</span>
                  <span>{formatDate(d.createdAt)}</span>
                </div>
              </div>
              <ExternalLink
                size={12}
                className="text-white/30 group-hover:text-white shrink-0"
              />
            </a>
          ))}
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
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate();
        }}
        className="rounded-lg border border-white/8 bg-white/[0.025] p-3 space-y-2"
      >
        <MentionTextarea
          rows={2}
          value={body}
          onChange={setBody}
          onSubmit={() => body.trim() && post.mutate()}
          placeholder="Share a note with the team… (type @ to mention)"
          excludeName={MY_NAME}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30">⌘/Ctrl + Enter to post · @-mentions DM the teammate</span>
          <Button size="sm" type="submit" disabled={!body.trim() || post.isPending}>
            <Send size={11} />
            {post.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="text-[11px] text-white/40 text-center py-4">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-5 text-center">
          <MessageSquare size={16} className="mx-auto text-white/30 mb-1.5" />
          <div className="text-xs text-white/55 font-semibold">No thread updates yet</div>
          <div className="text-[11px] text-white/35 mt-0.5">
            Share notes here to keep the team aligned.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-white/8 bg-white/[0.025] p-2.5 flex items-start gap-2.5"
            >
              <Avatar name={entry.authorName} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-semibold text-white">{entry.authorName}</span>
                  <span className="text-[10px] text-white/35">
                    {formatRelative(entry.createdAt)}
                  </span>
                </div>
                <div className="text-[13px] text-white/85 mt-0.5 leading-snug whitespace-pre-wrap">
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
