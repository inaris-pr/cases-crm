// Thin typed client over the Cases REST API.

// Role keys and permission types come from the shared lib/access package, so
// the web app and the API cannot disagree about them. (Type-only: erased at
// build time.)
import type { EffectivePermissions, RoleKey } from "@cases/access";
export type { EffectivePermissions, RoleKey } from "@cases/access";
// Phase 7 taxonomy keys live in the pure lib/caseMeta.ts.
import type { CaseCategory, EscalationReason } from "./caseMeta";
export type { CaseCategory, EscalationReason };

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
export const API = (path: string) => `${BASE}${path}`;

/**
 * Fired whenever the API answers 401 (no session, or it expired or was
 * revoked). AuthProvider listens and returns the app to the login screen.
 */
export const UNAUTHENTICATED_EVENT = "cases:unauthenticated";

/**
 * Identity travels only in the HttpOnly session cookie the API sets at login;
 * the browser attaches it automatically (same origin via the Vite proxy).
 * Nothing identity-related is read from localStorage or sent as a header.
 */
export async function fetchJson<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    ...opts,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (r.status === 401) {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || r.statusText);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

// ── Types ────────────────────────────────────────────────────────────────────
export type CaseStatus = "intake" | "review" | "in_progress" | "waiting" | "completed";
export type CasePriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type DocumentType = "contract" | "invoice" | "report" | "identity" | "other";
export type ConversationType = "dm" | "group";
export type LeadStatus = "new" | "working" | "qualified" | "unqualified" | "converted";
export type LeadSource = "referral" | "website" | "event" | "cold_call" | "partner" | "other";

// ── Account / Contact / Link ───────────────────────────────────────────────
export interface Address {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Account {
  // Core
  id: number;
  name: string;
  // Account Information
  portalId: number | null;
  oldCompanyName: string | null;
  state: string | null;
  entityType: string | null;
  portalLink: string | null;
  brand: string | null;
  subscriptionBundle: string | null;
  fincenId: string | null;
  fincenFilingDate: string | null;
  formationTier: string | null;
  automationStatus: string | null;
  stripeId: string | null;
  oldStripeIds: string | null;
  formationStatus: string | null;
  ownerName: string;
  /** The owning employee (authoritative since RBAC Phase 4); ownerName is a label. */
  ownerUserId?: number | null;
  archived: boolean;
  parentAccountId: number | null;
  companyPhone: string | null;
  filingId: string | null;
  ein: string | null;
  formationDate: string | null;
  firstTransactionDate: string | null;
  abandonedCartUrl: string | null;
  phoneForwardingPhone: string | null;
  voPhone: string | null;
  isFormationAutomated: boolean;
  shareType: string | null;
  commonShareQuantity: number | null;
  commonShareValue: number | null;
  preferredShareQuantity: number | null;
  preferredShareValue: number | null;
  // Renewal
  renewalStatus: string | null;
  renewalDate: string | null;
  // Addresses
  principalAddress: Address | null;
  mailingAddress: Address | null;
  // Banking
  bankingAppId: string | null;
  bankingAppStatus: string | null;
  bankingAppMessage: string | null;
  // Misc
  industry: string | null;
  website: string | null;
  // System
  createdAt: string;
  createdByName: string | null;
  lastModifiedAt: string | null;
  lastModifiedByName: string | null;
  /**
   * Fields the API masked or left out for this viewer (RBAC Phase 3, R2.2):
   * `ein`/`fincenId` arrive masked, financial identifiers as null. Show them
   * as "Restricted", never as empty (Phase 5).
   */
  redactedFields?: string[];
}

export interface AccountWithCounts extends Account {
  contactCount: number;
  /** Absent for viewers without cases.view (RBAC Phase 3); UI gating is Phase 5. */
  caseCount: number;
  openCaseCount: number;
}

export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  ownerName: string;
  ownerUserId?: number | null;
  createdAt: string;
}

export interface AccountContactLink {
  id: number;
  accountId: number;
  contactId: number;
  role: string;
  ownershipPct: number | null;
  isPrimary: boolean;
  isSignatory: boolean;
  startedAt: string;
  endedAt: string | null;
}

export interface ContactWithSummary extends Contact {
  fullName: string;
  accountCount: number;
  accountNames: string[];
  openCaseCount: number;
}

export interface AccountContactRow extends Contact {
  fullName: string;
  link: AccountContactLink;
}

export interface AccountDetail extends AccountWithCounts {
  contacts: AccountContactRow[];
  /** Absent for employees without cases.view (RBAC Phase 3). */
  cases?: Case[];
}

export interface ContactAccountRow extends Account {
  link: AccountContactLink;
}

export interface ContactDetail extends Contact {
  fullName: string;
  accounts: ContactAccountRow[];
  /** Absent for employees without cases.view (RBAC Phase 3). */
  cases?: Case[];
}

// ── Lead ───────────────────────────────────────────────────────────────────
export interface Lead {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  intendedState: string | null;
  intendedEntityType: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  ownerName: string;
  ownerUserId?: number | null;
  estimatedValue: number | null;
  convertedAt: string | null;
  convertedAccountId: number | null;
  convertedContactId: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Case ───────────────────────────────────────────────────────────────────
export interface Case {
  id: number;
  caseNumber: string;
  title: string;
  accountId: number;
  /** @deprecated mirrors accountId for backwards-compat with older pages */
  customerId: number;
  primaryContactId: number | null;
  status: CaseStatus;
  priority: CasePriority;
  description: string | null;
  tags: string[];
  ownerName: string;
  ownerUserId?: number | null;
  createdAt: string;
  updatedAt: string;
  /** Phase 7: one primary category, or null = uncategorized. */
  category: CaseCategory | null;
  /**
   * Phase 7: when the current closure happened and who closed it. Null while
   * open, and for Cases closed before Phase 7 (closing time unknown).
   */
  closedAt: string | null;
  closedByUserId: number | null;
  closedByName: string | null;
}

export interface CaseEscalation {
  id: number;
  caseId: number;
  reason: EscalationReason;
  note: string | null;
  escalatedAt: string;
  escalatedByUserId: number | null;
  escalatedByName: string;
  resolvedAt: string | null;
  resolvedByUserId: number | null;
  resolvedByName: string | null;
}

export interface CaseStatusEvent {
  id: number;
  caseId: number;
  kind: "status_change" | "closed" | "reopened";
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  changedAt: string;
  changedByUserId: number | null;
  changedByName: string;
}

export interface CaseResolution {
  /** closedAt − createdAt (ms): creation to the current closure, calendar time. */
  totalMs: number;
  /** Last reopen → current closure (ms); null if never reopened. */
  latestCycleMs: number | null;
  closedAt: string;
  closures: number;
}

/**
 * Legacy "customer" shape, synthesized server-side from Account + primary
 * Contact for backwards-compat with older list/detail pages.
 */
export interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  ownerName: string;
  createdAt: string;
}

export interface CustomerWithCounts extends Customer {
  caseCount: number;
  /**
   * The Contact whose name/email/phone this row shows, or null when the
   * account has no linked contact. `id` is the Account id — never use it as a
   * Contact id.
   */
  primaryContactId: number | null;
}

export interface CaseWithRelations extends Case {
  account: Account | null;
  primaryContact: Contact | null;
  customer: Customer | null;
  /** Phase 7: the unresolved escalation, if any. */
  activeEscalation: CaseEscalation | null;
}

// Backwards-compat alias — old pages used CaseWithCustomer
export type CaseWithCustomer = CaseWithRelations;

export interface Task {
  id: number;
  caseId: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  /** Thread follow-up: null when not recorded (older tasks). */
  createdByUserId?: number | null;
  createdByName?: string | null;
  completedAt?: string | null;
  completedByUserId?: number | null;
  completedByName?: string | null;
}

export interface Doc {
  id: number;
  caseId: number;
  filename: string;
  fileUrl: string;
  type: DocumentType;
  size: number;
  tags: string[];
  createdAt: string;
  /** Thread follow-up: null for documents added before it. */
  uploadedByUserId?: number | null;
  uploadedByName?: string | null;
}

export interface CaseDetail extends CaseWithRelations {
  tasks: Task[];
  documents: Doc[];
  /** Phase 7: recorded status changes, oldest first. */
  statusHistory: CaseStatusEvent[];
  /** Phase 7: every escalation, oldest first. */
  escalations: CaseEscalation[];
  /** Phase 7: only when the Case is closed with a known closedAt. */
  resolution: CaseResolution | null;
}

export interface Stats {
  totalCases: number;
  completedCases: number;
  openTasks: number;
  totalCustomers: number;
  trend30: { date: string; cases: number; tasks: number }[];
  statusBreakdown: { status: CaseStatus; count: number }[];
}

export interface Conversation {
  id: number;
  name: string | null;
  type: ConversationType;
  createdAt: string;
  members: string[];
  /** Members by employee id (authoritative); `members` are display names. */
  memberUserIds?: number[];
  lastMessage?: string | null;
  lastMessageAt?: string | null;
}


/** The signed-in employee as the API returns it (never includes the password hash). */
export interface User {
  id: number;
  name: string;
  email: string;
  roles: RoleKey[];
  departmentKey: string | null;
  active: boolean;
  demo: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MeResponse {
  user: User;
  teams: { id: number; name: string; departmentKey: string; relation: "member" | "supervisor" }[];
  /** Effective permissions from the user's roles (lib/access). */
  permissions: EffectivePermissions;
  /** Members of the teams this employee supervises ("team" scope). */
  supervisedUserIds?: number[];
}

export interface Message {
  id: number;
  conversationId: number;
  senderName: string;
  senderUserId?: number | null;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  caseTags: { id: number; caseNumber: string }[];
}

export type ContactDirection = "inbound" | "outbound";
export type ContactChannel = "phone" | "email" | "sms" | "meeting" | "other";

export interface CaseInteraction {
  id: number;
  caseId: number;
  direction: ContactDirection;
  channel: ContactChannel;
  summary: string;
  contact: string;
  byName: string;
  byUserId?: number | null;
  createdAt: string;
}

// Legacy alias
export type CaseContact = CaseInteraction;

export interface CaseThreadEntry {
  id: number;
  caseId: number;
  authorName: string;
  authorUserId?: number | null;
  body: string;
  createdAt: string;
}

// ── Automations ────────────────────────────────────────────────────────────
// Mirrors artifacts/api-server/src/store.ts. A global automation is one row
// offered to every case by union at read time; a case that customizes one gets
// its own copy and the original is hidden from that case only.
export type AutomationScope = "case" | "global";

export type AutomationNodeType =
  | "trigger"
  | "filter"
  | "assign"
  | "notify"
  | "delay"
  | "branch"
  | "http"
  | "update";

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  x: number;
  y: number;
  config: Record<string, string>;
}

export interface AutomationEdge {
  from: string;
  to: string;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  viewport?: { pan: { x: number; y: number }; zoom: number } | null;
}

export interface Automation {
  id: number;
  name: string;
  scope: AutomationScope;
  caseId: number | null;
  graph: AutomationGraph;
  enabled: boolean;
  derivedFromAutomationId: number | null;
  originCaseId: number | null;
  ownerName: string;
  ownerUserId?: number | null;
  createdAt: string;
  createdByName: string | null;
  updatedAt: string;
  lastModifiedByName: string | null;
}

/** List row: the graph is omitted and the UI flags are derived server-side. */
export interface AutomationSummary extends Omit<Automation, "graph"> {
  nodeCount: number;
  edgeCount: number;
  /** Reaches this case through the global union rather than being owned by it. */
  inherited: boolean;
  /** A case-scoped row standing in for a global. */
  customized: boolean;
}

export interface AutomationUsage {
  scope: AutomationScope;
  caseCount: number;
  forkedByCaseCount: number;
}

export interface Mention {
  id: number;
  threadEntryId: number;
  caseId: number;
  fromName: string;
  toName: string;
  fromUserId?: number | null;
  toUserId?: number | null;
  body: string;
  readAt: string | null;
  createdAt: string;
  caseNumber: string | null;
  caseTitle: string | null;
}

// ── Dashboard (RBAC Phase 6) — mirrors artifacts/api-server/src/dashboard.ts ──
// Every section is optional: the server includes one only when the signed-in
// employee's permissions allow it, computed over records in their scope.

export type DashboardScope = "own" | "team" | "all";
export type ActivitySource = "created" | "updated" | "call_log" | "comment" | "task" | "document";

export interface DashboardCaseItem {
  id: number;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  ownerUserId: number | null;
  ownerName: string;
  openTasks: number;
  overdueTasks: number;
  lastActivityAt: string;
  lastActivitySource: ActivitySource;
  category: CaseCategory | null;
  escalation: { id: number; reason: EscalationReason; escalatedAt: string; escalatedByName: string } | null;
  reasons?: ("escalated" | "critical_priority" | "high_priority" | "overdue_tasks")[];
}

export interface DashboardCases {
  scope: DashboardScope;
  summary: {
    open: number;
    completed: number;
    urgentOpen: number;
    openTasks: number;
    overdueTasks: number;
    activeEscalations: number;
  };
  byStatus: { status: CaseStatus; count: number }[];
  byPriority: { priority: CasePriority; count: number }[];
  trend30: { date: string; cases: number; tasks: number }[];
  recent: DashboardCaseItem[];
  attention: DashboardCaseItem[];
  leastRecentlyWorked: DashboardCaseItem[];
  recentActivity: {
    kind: "call_log" | "comment" | "task" | "document";
    caseId: number;
    caseNumber: string;
    at: string;
    byName: string | null;
    text: string;
  }[];
  workload?: {
    userId: number | null;
    name: string;
    active: boolean;
    openCases: number;
    urgentCases: number;
    openTasks: number;
    overdueTasks: number;
    escalated: number;
  }[];
  escalated: DashboardCaseItem[];
  recentEscalations: {
    id: number;
    caseId: number;
    caseNumber: string;
    event: "escalated" | "resolved";
    reason: EscalationReason;
    at: string;
    byName: string;
  }[];
  byCategory?: { category: CaseCategory | null; count: number }[];
}

export interface DashboardCalls {
  scope: DashboardScope;
  last7Days: number;
  last30Days: number;
  byChannel30: { channel: ContactChannel; count: number }[];
  recent: {
    id: number;
    caseId: number;
    caseNumber: string;
    channel: ContactChannel;
    direction: ContactDirection;
    contact: string;
    byName: string;
    createdAt: string;
  }[];
}

export interface DashboardLeads {
  scope: DashboardScope;
  summary: { active: number; total: number };
  byStatus: { status: LeadStatus; count: number }[];
  recent: {
    id: number;
    name: string;
    companyName: string | null;
    status: LeadStatus;
    ownerUserId: number | null;
    ownerName: string;
    updatedAt: string;
  }[];
  workload?: {
    userId: number | null;
    name: string;
    active: boolean;
    activeLeads: number;
    totalLeads: number;
    byStatus: Record<LeadStatus, number>;
  }[];
}

export interface DashboardAccounts {
  scope: DashboardScope;
  owned: number;
  linkedClients: number;
  totalClients?: number;
  recent: { id: number; name: string; ownerName: string; createdAt: string }[];
  byOwner?: { userId: number | null; name: string; count: number }[];
}

export interface DashboardPeople {
  scope: DashboardScope;
  activeEmployees: number;
  inactiveEmployees: number;
  byDepartment: { key: string | null; label: string; count: number }[];
  byRole: { key: string; label: string; count: number }[];
  teams: {
    id: number;
    name: string;
    departmentLabel: string;
    supervisors: { id: number; name: string }[];
    members: { id: number; name: string; roles: string[]; active: boolean }[];
  }[];
}

export interface DashboardCommunication {
  unreadMentions: number;
  mentions: {
    id: number;
    fromName: string;
    body: string;
    caseId: number;
    caseNumber: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
  conversations: {
    id: number;
    name: string | null;
    type: string;
    members: string[];
    lastMessage: string | null;
    lastMessageAt: string | null;
  }[];
}

export interface DashboardData {
  generatedAt: string;
  cases?: DashboardCases;
  calls?: DashboardCalls;
  leads?: DashboardLeads;
  accounts?: DashboardAccounts;
  people?: DashboardPeople;
  communication?: DashboardCommunication;
}

// ── Case Thread feed (Phase 7 follow-up) — mirrors api-server/src/caseFeed.ts ──
// GET /api/cases/:id/feed: human comments and system activity, merged and
// ordered on the server (oldest first).

export interface FeedActor {
  userId: number | null;
  name: string;
}

export interface CallSummary {
  id: number;
  at: string;
  by: FeedActor;
  contact: string;
  summary: string;
}

type FeedEntryOf<T extends string, D> = { key: string; type: T; at: string; actor: FeedActor | null } & D;

export type FeedEntry =
  | FeedEntryOf<"comment", { comment: { id: number; authorName: string; authorUserId: number | null; body: string; createdAt: string } }>
  | FeedEntryOf<"status_change", { kind: "status_change" | "closed" | "reopened"; fromStatus: CaseStatus | null; toStatus: CaseStatus }>
  | FeedEntryOf<"category_change", { from: CaseCategory | null; to: CaseCategory | null }>
  | FeedEntryOf<"priority_change", { from: CasePriority; to: CasePriority }>
  | FeedEntryOf<"owner_change", { fromUserId: number | null; fromName: string; toUserId: number; toName: string }>
  | FeedEntryOf<"account_change", { fromAccountId: number; fromName: string; toAccountId: number; toName: string }>
  | FeedEntryOf<"primary_contact_change", { fromContactId: number | null; fromName: string | null; toContactId: number | null; toName: string | null }>
  | FeedEntryOf<"escalation_created", { escalationId: number; reason: EscalationReason; note: string | null }>
  | FeedEntryOf<"escalation_resolved", { escalationId: number; reason: EscalationReason }>
  | FeedEntryOf<"task_created", { taskId: number; title: string }>
  | FeedEntryOf<"task_completed", { taskId: number; title: string }>
  | FeedEntryOf<"task_reopened", { taskId: number; title: string; toStatus: TaskStatus }>
  | FeedEntryOf<"document_uploaded", { documentId: number; filename: string; href: string | null }>
  | FeedEntryOf<"document_removed", { documentId: number; filename: string }>
  | FeedEntryOf<"calls_outgoing_summary" | "calls_incoming_summary", { count: number; latest: CallSummary; previous: { id: number; at: string; by: FeedActor }[] }>
  | FeedEntryOf<"contact_logged", { interactionId: number; direction: ContactDirection; channel: ContactChannel; contact: string; summary: string }>
  | FeedEntryOf<"automation_execution", { automationId: number; automationName: string; outcome: "succeeded" | "failed" }>;

export interface CaseFeed {
  caseId: number;
  /** Entries in the feed (each aggregated call card counts once). */
  count: number;
  entries: FeedEntry[];
}
