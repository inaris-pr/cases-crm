// Thin typed client over the Cases REST API.

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
export const API = (path: string) => `${BASE}${path}`;

function currentUserName(): string | null {
  try {
    const raw = localStorage.getItem("cases.auth.user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

export async function fetchJson<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const me = currentUserName();
  const r = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(me ? { "X-User": me } : {}),
      ...(opts.headers ?? {}),
    },
  });
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
}

export interface AccountWithCounts extends Account {
  contactCount: number;
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
  cases: Case[];
}

export interface ContactAccountRow extends Account {
  link: AccountContactLink;
}

export interface ContactDetail extends Contact {
  fullName: string;
  accounts: ContactAccountRow[];
  cases: Case[];
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
  createdAt: string;
  updatedAt: string;
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
}

export interface CaseWithRelations extends Case {
  account: Account | null;
  primaryContact: Contact | null;
  customer: Customer | null;
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
}

export interface CaseDetail extends CaseWithRelations {
  tasks: Task[];
  documents: Doc[];
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
  lastMessage?: string | null;
  lastMessageAt?: string | null;
}

export type UserRole = "admin" | "manager" | "case_manager" | "analyst" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  senderName: string;
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
  createdAt: string;
}

// Legacy alias
export type CaseContact = CaseInteraction;

export interface CaseThreadEntry {
  id: number;
  caseId: number;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Mention {
  id: number;
  threadEntryId: number;
  caseId: number;
  fromName: string;
  toName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  caseNumber: string | null;
  caseTitle: string | null;
}
