/**
 * The Case Thread as a unified timeline (Phase 7 follow-up): human comments
 * and system activity from GET /api/cases/:id/feed, already merged and
 * ordered by the server. Human comments keep their look; system activity is
 * compact, secondary and read-only (it never carries @-mentions).
 */
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  CircleDot,
  FileText,
  Flag,
  Mail,
  PhoneIncoming,
  PhoneOutgoing,
  RotateCcw,
  ShieldCheck,
  Siren,
  Tag,
  UserRound,
  Workflow,
  ListPlus,
  MessageSquareText,
} from "lucide-react";
import type { CasePriority, FeedEntry } from "@/lib/api";
import { CASE_STATUS_PICKER_LABEL, categoryLabel, escalationReasonLabel } from "@/lib/caseMeta";
import { Avatar } from "@/components/ui/Avatar";
import { MentionBody } from "@/components/MentionInput";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

/** "Sep 25, 2026 · 8:42 AM" */
export function feedTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(d, { month: "short", day: "numeric", year: "numeric" })} · ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d)}`;
}

const PRIORITY_LABEL: Record<CasePriority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const statusLabel = (s: string | null) => (s ? CASE_STATUS_PICKER_LABEL[s as keyof typeof CASE_STATUS_PICKER_LABEL] ?? s : "—");
const CHANNEL_LABEL: Record<string, string> = { email: "Email", sms: "SMS", meeting: "Meeting", other: "Contact", phone: "Call" };

function FromTo({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-white/60">{from}</span>
      <ArrowRight size={11} className="text-white/35" />
      <span className="text-white/90 font-medium">{to}</span>
    </span>
  );
}

/** One compact system row. */
function SystemRow({
  entry,
  icon: Icon,
  tone,
  title,
  children,
  byline,
}: {
  entry: FeedEntry;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
  title: string;
  children?: ReactNode;
  byline?: ReactNode;
}) {
  return (
    <div
      data-testid={`feed-${entry.type}`}
      data-feed-key={entry.key}
      className="flex items-start gap-3 rounded-lg px-3 py-2 border border-white/[0.05] bg-white/[0.015]"
    >
      <div className="size-6 rounded-md grid place-items-center shrink-0 mt-0.5" style={{ background: `${tone}1f`, color: tone }}>
        <Icon size={12} />
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <div className="font-semibold text-white/85">{title}</div>
        {children && <div className="text-white/70 mt-0.5 break-words">{children}</div>}
        <div className="text-[11px] text-white/40 mt-0.5">
          {byline ? <>{byline} · </> : null}
          {feedTime(entry.at)}
        </div>
      </div>
    </div>
  );
}

const by = (entry: FeedEntry, verb: string) => (entry.actor ? `${verb} by ${entry.actor.name}` : null);

function CallCard({ entry, onViewCalls }: { entry: Extract<FeedEntry, { type: "calls_outgoing_summary" | "calls_incoming_summary" }>; onViewCalls?: () => void }) {
  const outgoing = entry.type === "calls_outgoing_summary";
  const Icon = outgoing ? PhoneOutgoing : PhoneIncoming;
  const tone = outgoing ? "#29f312" : "#38bdf8";
  return (
    <div
      data-testid={`feed-${entry.type}`}
      data-feed-key={entry.key}
      className="rounded-lg px-3 py-2.5 border border-white/[0.07] bg-white/[0.025]"
    >
      <div className="flex items-center gap-2">
        <div className="size-6 rounded-md grid place-items-center shrink-0" style={{ background: `${tone}1f`, color: tone }}>
          <Icon size={12} />
        </div>
        <span className="text-xs font-semibold text-white/90">{outgoing ? "Outgoing calls" : "Incoming calls"}</span>
        <span className="ml-auto text-[11px] font-semibold tabular-nums rounded-full px-2 py-0.5 bg-white/5 text-white/70" data-testid="call-count">
          {entry.count} call{entry.count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 pl-8 text-xs space-y-1">
        <div>
          <span className="text-white/40">Latest: </span>
          <span className="text-white/85" data-testid="call-latest">{feedTime(entry.latest.at)}</span>
          <span className="text-white/50">
            {" "}
            · {outgoing ? "Called" : "Received"} by {entry.latest.by.name} · {entry.latest.contact}
          </span>
        </div>
        {entry.latest.summary && <div className="text-white/60 truncate">{entry.latest.summary}</div>}
        {entry.previous.length > 0 && (
          <div className="text-white/45">
            <span className="text-white/35">Previous: </span>
            {entry.previous.map((p) => formatDate(p.at, { month: "short", day: "numeric" }) + " · " + new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(p.at))).join("  ·  ")}
            {entry.count > entry.previous.length + 1 && <span> · +{entry.count - entry.previous.length - 1} more</span>}
          </div>
        )}
        {onViewCalls && (
          <button type="button" onClick={onViewCalls} className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-1" data-testid="view-call-details">
            View call details <ArrowRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function FeedItem({ entry, onViewCalls }: { entry: FeedEntry; onViewCalls?: () => void }) {
  switch (entry.type) {
    case "comment":
      return (
        <div
          data-testid="feed-comment"
          data-feed-key={entry.key}
          className="rounded-xl border border-white/8 bg-white/[0.025] p-3.5 flex items-start gap-3"
        >
          <Avatar name={entry.comment.authorName} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-white">{entry.comment.authorName}</span>
              <span className="text-[11px] text-white/40" title={feedTime(entry.at)}>
                {formatRelative(entry.at)}
              </span>
            </div>
            <div className="text-sm text-white/85 mt-1 leading-relaxed whitespace-pre-wrap">
              <MentionBody body={entry.comment.body} />
            </div>
          </div>
        </div>
      );
    case "status_change": {
      const title = entry.kind === "closed" ? "Case closed" : entry.kind === "reopened" ? "Case reopened" : "Status changed";
      const icon = entry.kind === "closed" ? CheckCircle2 : entry.kind === "reopened" ? RotateCcw : CircleDot;
      return (
        <SystemRow entry={entry} icon={icon} tone="#60a5fa" title={title} byline={by(entry, entry.kind === "closed" ? "Closed" : entry.kind === "reopened" ? "Reopened" : "Changed")}>
          {entry.fromStatus ? <FromTo from={statusLabel(entry.fromStatus)} to={statusLabel(entry.toStatus)} /> : <>Created as {statusLabel(entry.toStatus)}</>}
        </SystemRow>
      );
    }
    case "category_change":
      return (
        <SystemRow entry={entry} icon={Tag} tone="#94a3b8" title="Category changed" byline={by(entry, "Changed")}>
          <FromTo from={categoryLabel(entry.from)} to={categoryLabel(entry.to)} />
        </SystemRow>
      );
    case "priority_change":
      return (
        <SystemRow entry={entry} icon={Flag} tone="#f97316" title="Priority changed" byline={by(entry, "Changed")}>
          <FromTo from={PRIORITY_LABEL[entry.from]} to={PRIORITY_LABEL[entry.to]} />
        </SystemRow>
      );
    case "owner_change":
      return (
        <SystemRow entry={entry} icon={ArrowRightLeft} tone="#a78bfa" title="Owner changed" byline={by(entry, "Reassigned")}>
          <FromTo from={entry.fromName} to={entry.toName} />
        </SystemRow>
      );
    case "account_change":
      return (
        <SystemRow entry={entry} icon={Building2} tone="#94a3b8" title="Account changed" byline={by(entry, "Changed")}>
          <FromTo from={entry.fromName} to={entry.toName} />
        </SystemRow>
      );
    case "primary_contact_change":
      return (
        <SystemRow entry={entry} icon={UserRound} tone="#94a3b8" title="Primary client changed" byline={by(entry, "Changed")}>
          <FromTo from={entry.fromName ?? "None"} to={entry.toName ?? "None"} />
        </SystemRow>
      );
    case "escalation_created":
      return (
        <SystemRow entry={entry} icon={Siren} tone="#fb7185" title="Case escalated" byline={by(entry, "Escalated")}>
          <span className="text-white/85">{escalationReasonLabel(entry.reason)}</span>
          {entry.note && <div className="text-white/60 whitespace-pre-wrap mt-0.5">{entry.note}</div>}
        </SystemRow>
      );
    case "escalation_resolved":
      return (
        <SystemRow entry={entry} icon={ShieldCheck} tone="#34d399" title="Escalation resolved" byline={by(entry, "Resolved")}>
          {escalationReasonLabel(entry.reason)}
        </SystemRow>
      );
    case "task_created":
      return (
        <SystemRow entry={entry} icon={ListPlus} tone="#fbbf24" title="Task created" byline={entry.actor ? `Created by ${entry.actor.name}` : "Creator not recorded"}>
          {entry.title}
          {entry.titleSource === "first_recorded" && (
            <span className="text-white/35" title="This task predates history tracking: its title as first recorded">
              {" "}
              · title as first recorded
            </span>
          )}
        </SystemRow>
      );
    case "task_completed":
      return (
        <SystemRow entry={entry} icon={CheckCircle2} tone="#fbbf24" title="Task completed" byline={by(entry, "Completed")}>
          {entry.title}
        </SystemRow>
      );
    case "task_reopened":
      return (
        <SystemRow entry={entry} icon={RotateCcw} tone="#fbbf24" title="Task reopened" byline={by(entry, "Reopened")}>
          {entry.title}
        </SystemRow>
      );
    case "document_uploaded":
      return (
        <SystemRow entry={entry} icon={FileText} tone="#38bdf8" title="Document uploaded" byline={entry.actor ? `Uploaded by ${entry.actor.name}` : "Uploader not recorded"}>
          {entry.href ? (
            <a
              href={entry.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline break-all"
              data-testid="feed-document-link"
            >
              {entry.filename}
            </a>
          ) : (
            <span className="break-all" title="This document has no openable link">
              {entry.filename}
            </span>
          )}
        </SystemRow>
      );
    case "document_removed":
      return (
        <SystemRow entry={entry} icon={FileText} tone="#94a3b8" title="Document removed" byline={by(entry, "Removed")}>
          {entry.filename}
        </SystemRow>
      );
    case "calls_outgoing_summary":
    case "calls_incoming_summary":
      return <CallCard entry={entry} onViewCalls={onViewCalls} />;
    case "contact_logged":
      return (
        <SystemRow
          entry={entry}
          icon={entry.channel === "email" ? Mail : MessageSquareText}
          tone="#2dd4bf"
          title={`${CHANNEL_LABEL[entry.channel] ?? "Contact"} ${entry.direction === "outbound" ? "to" : "from"} ${entry.contact}`}
          byline={by(entry, "Logged")}
        >
          <span className="line-clamp-2">{entry.summary}</span>
        </SystemRow>
      );
    case "automation_execution":
      return (
        <SystemRow entry={entry} icon={Workflow} tone="#c084fc" title="Automation ran">
          {entry.automationName} · {entry.outcome === "succeeded" ? "Completed successfully" : "Failed"}
        </SystemRow>
      );
  }
}

/** The whole feed, in server order. */
export function CaseFeedList({
  entries,
  onViewCalls,
  className,
}: {
  entries: FeedEntry[];
  onViewCalls?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)} data-testid="case-feed">
      {entries.map((e) => (
        <FeedItem key={e.key} entry={e} onViewCalls={onViewCalls} />
      ))}
    </div>
  );
}
