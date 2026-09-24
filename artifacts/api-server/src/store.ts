// ─────────────────────────────────────────────────────────────────────────────
// In-memory data store + JSON file persistence for the Cases API.
//
// All mutations call persist() which (debounced) writes the entire store to
// artifacts/api-server/data/store.json. On boot, if that file exists, the
// store is hydrated from it; otherwise the demo seed runs.
//
// To reset, delete `artifacts/api-server/data/store.json` and restart.
// ─────────────────────────────────────────────────────────────────────────────
import * as fs from "node:fs";
import * as path from "node:path";
import { hashPasswordSync } from "./auth/password.js";
import { DEMO_PASSWORD, type DepartmentKey, type RoleKey } from "./auth/identity.js";
import {
  CURRENT_SCHEMA_VERSION,
  MigrationAbortError,
  ensureDemoEmployees,
  ensureDemoTeams,
  migrateStoreFile,
} from "./migrations.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
/** Pre-migration backups (git-ignored with the rest of data/). */
const BACKUP_DIR = path.join(DATA_DIR, "backups");

export type CaseStatus = "intake" | "review" | "in_progress" | "waiting" | "completed";
export type CasePriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type DocumentType = "contract" | "invoice" | "report" | "identity" | "other";
export type ConversationType = "dm" | "group";
export type LeadStatus = "new" | "working" | "qualified" | "unqualified" | "converted";
export type LeadSource = "referral" | "website" | "event" | "cold_call" | "partner" | "other";

/**
 * Structured postal address. Used for both Principal Place of Business and
 * Mailing Address on accounts.
 */
export interface Address {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/**
 * A company / entity record. The center of gravity for everything in the CRM:
 * contacts, cases, deals, documents, and activities all roll up to an Account.
 * One person (Contact) can be linked to many Accounts via AccountContactLink.
 *
 * Field labels follow the Salesforce-style account record (Wyoming LLC Attorney
 * platform): Portal ID, Filing ID, EIN, Renewal Status, Banking App, etc.
 */
export interface Account {
  // ── Core ──────────────────────────────────────────────────────────────
  id: number;
  name: string;
  // ── Account Information ──────────────────────────────────────────────
  portalId: number | null;          // public-facing portal account id
  oldCompanyName: string | null;
  state: string | null;             // "Formation State" — jurisdiction code or name
  entityType: string | null;        // "Company Type" — "LLC", "PLLC", "Series LLC", etc.
  portalLink: string | null;        // hyperlink into our customer portal
  brand: string | null;             // "Wyoming LLC Attorney", "DE LLC Attorney", etc.
  subscriptionBundle: string | null;// "Basic", "Standard", "Premium"
  fincenId: string | null;          // FinCEN BOI submission identifier
  fincenFilingDate: string | null;
  formationTier: string | null;     // "Standard", "Professional", "Premium"
  automationStatus: string | null;  // "Succeeded", "Failed", "Pending"
  stripeId: string | null;
  oldStripeIds: string | null;
  formationStatus: string | null;
  // ── Account Information (right column) ───────────────────────────────
  ownerName: string;                // "Account Owner"
  archived: boolean;
  parentAccountId: number | null;
  companyPhone: string | null;
  filingId: string | null;          // state filing confirmation number
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
  // ── Renewal Information ──────────────────────────────────────────────
  renewalStatus: string | null;     // "Active", "Good Standing", "Administratively Dissolved"
  renewalDate: string | null;
  // ── Address Information ──────────────────────────────────────────────
  principalAddress: Address | null;
  mailingAddress: Address | null;
  // ── Banking Information ──────────────────────────────────────────────
  bankingAppId: string | null;
  bankingAppStatus: string | null;  // "APPROVED", "DENIED", "PENDING", "NOT_STARTED"
  bankingAppMessage: string | null;
  // ── Misc / legacy ────────────────────────────────────────────────────
  industry: string | null;
  website: string | null;
  // ── System Information ───────────────────────────────────────────────
  createdAt: string;
  createdByName: string | null;
  lastModifiedAt: string | null;
  lastModifiedByName: string | null;
}

/**
 * A person record. A contact can be linked to many accounts via
 * AccountContactLink, each link carrying a role and ownership percentage.
 */
export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;     // job title, e.g., "Founder", "CFO", "Outside Counsel"
  ownerName: string;        // teammate who owns this relationship
  createdAt: string;
}

/**
 * Many-to-many link between Account and Contact. Carries the role of the
 * person on that account (Founder, Manager, Member, Outside Counsel, …) and
 * optional ownership percentage / signatory flag.
 */
export interface AccountContactLink {
  id: number;
  accountId: number;
  contactId: number;
  role: string;                 // "Founder", "Manager", "Member", "Outside Counsel", …
  ownershipPct: number | null;  // 0-100, null when not applicable
  isPrimary: boolean;           // this contact is the primary point of contact for the account
  isSignatory: boolean;
  startedAt: string;
  endedAt: string | null;       // null when still active
}

/**
 * An unqualified prospect. Person info and company info live on the same
 * record because at this stage we don't know if it will become a real
 * Account+Contact. When qualified, the lead is converted (creating an
 * Account, a Contact, and a link in one atomic operation) and marked
 * converted.
 */
export interface Lead {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;       // tentative entity name
  intendedState: string | null;     // jurisdiction they want to form in
  intendedEntityType: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  ownerName: string;
  estimatedValue: number | null;    // dollar estimate of the deal
  convertedAt: string | null;
  convertedAccountId: number | null;
  convertedContactId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Case {
  id: number;
  caseNumber: string;
  title: string;
  accountId: number;                 // the company the case is for
  primaryContactId: number | null;   // the person we're primarily talking to
  status: CaseStatus;
  priority: CasePriority;
  description: string | null;
  tags: string[];
  ownerName: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface Conversation {
  id: number;
  name: string | null;
  type: ConversationType;
  createdAt: string;
  members: string[];
}

export interface Message {
  id: number;
  conversationId: number;
  senderName: string;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  caseTags: number[];
}

/**
 * An employee login. `passwordHash` is scrypt (see auth/password.ts) and never
 * leaves the server — responses go through publicUser(). Roles are stored in
 * Phase 1 but do not yet grant or deny anything (permissions arrive in
 * Phase 2/3).
 */
export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  roles: RoleKey[];
  departmentKey: DepartmentKey | null;
  /** Inactive employees cannot sign in and lose their sessions. */
  active: boolean;
  /** Demo/test employee, safe to deactivate or remove. */
  demo: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** A group of employees. Groundwork for team scope (Phase 4); no access effect yet. */
export interface Team {
  id: number;
  name: string;
  departmentKey: DepartmentKey;
  memberUserIds: number[];
  supervisorUserIds: number[];
  demo: boolean;
  createdAt: string;
}

/**
 * A server-side login session. Only the SHA-256 of the cookie token is
 * stored, so a copy of store.json cannot be used to sign in.
 */
export interface Session {
  id: number;
  tokenHash: string;
  userId: number;
  createdAt: string;
  lastSeenAt: string;
  /** Absolute expiry, fixed at login. The idle limit is checked against lastSeenAt. */
  expiresAt: string;
}

export type ContactDirection = "inbound" | "outbound";
export type ContactChannel = "phone" | "email" | "sms" | "meeting" | "other";

/**
 * An interaction log on a case (phone call, email, meeting). Distinct from
 * the first-class Contact entity. The `contact` field is the freeform name
 * of the person on the other end (often, but not always, a linked Contact).
 */
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
}

// ── Automations ──────────────────────────────────────────────────────────────
// An automation is a saved visual workflow graph. Its `scope` decides who can
// see it:
//
//   "case"   — belongs to exactly one case (`caseId` set). Invisible elsewhere.
//   "global" — belongs to no case (`caseId` null) and is offered to EVERY case,
//              existing and future, by union at read time. A global automation
//              is ONE row; it is never materialised per case.
//
// A case can fork a global ("Customize for this case"): that creates a
// case-scoped copy carrying `derivedFromAutomationId`, and the original global
// is then hidden from that case only. Deleting the fork ("Revert to global")
// restores the inherited original.
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
  /** Last saved pan/zoom, so a graph reopens where the author left it. */
  viewport?: { pan: { x: number; y: number }; zoom: number } | null;
}

export interface Automation {
  id: number;
  name: string;
  scope: AutomationScope;
  /** Non-null iff scope === "case". */
  caseId: number | null;
  graph: AutomationGraph;
  enabled: boolean;
  /** Set on a case-scoped fork of a global; hides that global from this case. */
  derivedFromAutomationId: number | null;
  /** Where a promoted global originally came from, for provenance only. */
  originCaseId: number | null;
  ownerName: string;
  createdAt: string;
  createdByName: string | null;
  updatedAt: string;
  lastModifiedByName: string | null;
}

// ── State ────────────────────────────────────────────────────────────────────
export const store = {
  accounts: [] as Account[],
  contacts: [] as Contact[],
  accountContactLinks: [] as AccountContactLink[],
  leads: [] as Lead[],
  cases: [] as Case[],
  tasks: [] as Task[],
  documents: [] as Doc[],
  conversations: [] as Conversation[],
  messages: [] as Message[],
  caseInteractions: [] as CaseInteraction[],
  threadEntries: [] as CaseThreadEntry[],
  mentions: [] as Mention[],
  users: [] as User[],
  teams: [] as Team[],
  sessions: [] as Session[],
  automations: [] as Automation[],
  /** Schema version of the persisted store; see migrations.ts. */
  meta: { schemaVersion: 0 },
  seq: {
    account: 0,
    contact: 0,
    accountContactLink: 0,
    lead: 0,
    case: 0,
    caseNumber: 0,
    task: 0,
    document: 0,
    conversation: 0,
    message: 0,
    caseInteraction: 0,
    threadEntry: 0,
    mention: 0,
    user: 0,
    team: 0,
    session: 0,
    automation: 0,
  },
};

function nextId(key: keyof typeof store.seq) {
  store.seq[key] += 1;
  return store.seq[key];
}

export const nextAccountId = () => nextId("account");
export const nextContactId = () => nextId("contact");
export const nextAccountContactLinkId = () => nextId("accountContactLink");
export const nextLeadId = () => nextId("lead");
export const nextCaseId = () => nextId("case");
export const nextTaskId = () => nextId("task");
export const nextDocumentId = () => nextId("document");
export const nextConversationId = () => nextId("conversation");
export const nextMessageId = () => nextId("message");
export const nextCaseInteractionId = () => nextId("caseInteraction");
export const nextThreadEntryId = () => nextId("threadEntry");
export const nextMentionId = () => nextId("mention");
export const nextUserId = () => nextId("user");
export const nextAutomationId = () => nextId("automation");
export const nextTeamId = () => nextId("team");
export const nextSessionId = () => nextId("session");

export function userByEmail(email: string): User | undefined {
  const lc = email.toLowerCase();
  return store.users.find((u) => u.email.toLowerCase() === lc);
}

export function nextCaseNumber() {
  store.seq.caseNumber += 1;
  return `CASE-${String(store.seq.caseNumber).padStart(3, "0")}`;
}

// ── Helpers for the new entities ────────────────────────────────────────────

export function contactFullName(c: Contact): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/** All contacts linked to a given account, in link order. */
export function contactsForAccount(accountId: number) {
  return store.accountContactLinks
    .filter((l) => l.accountId === accountId && !l.endedAt)
    .map((link) => {
      const contact = store.contacts.find((c) => c.id === link.contactId);
      return contact ? { contact, link } : null;
    })
    .filter((x): x is { contact: Contact; link: AccountContactLink } => x !== null);
}

/** All accounts a contact is linked to. */
export function accountsForContact(contactId: number) {
  return store.accountContactLinks
    .filter((l) => l.contactId === contactId && !l.endedAt)
    .map((link) => {
      const account = store.accounts.find((a) => a.id === link.accountId);
      return account ? { account, link } : null;
    })
    .filter((x): x is { account: Account; link: AccountContactLink } => x !== null);
}

/** Find the primary contact for an account, falling back to first linked contact. */
export function primaryContactForAccount(accountId: number): Contact | null {
  const links = store.accountContactLinks.filter(
    (l) => l.accountId === accountId && !l.endedAt,
  );
  const primary = links.find((l) => l.isPrimary) ?? links[0];
  if (!primary) return null;
  return store.contacts.find((c) => c.id === primary.contactId) ?? null;
}

// ── Seed ─────────────────────────────────────────────────────────────────────
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * Build an Account record with sensible nullable defaults so seed call sites
 * only have to specify the fields that matter for each company.
 */
export function makeAccount(
  partial: Partial<Account> & {
    id: number;
    name: string;
    ownerName: string;
    createdAt: string;
  },
): Account {
  return {
    portalId: null,
    oldCompanyName: null,
    state: null,
    entityType: null,
    portalLink: null,
    brand: null,
    subscriptionBundle: null,
    fincenId: null,
    fincenFilingDate: null,
    formationTier: null,
    automationStatus: null,
    stripeId: null,
    oldStripeIds: null,
    formationStatus: null,
    archived: false,
    parentAccountId: null,
    companyPhone: null,
    filingId: null,
    ein: null,
    formationDate: null,
    firstTransactionDate: null,
    abandonedCartUrl: null,
    phoneForwardingPhone: null,
    voPhone: null,
    isFormationAutomated: false,
    shareType: null,
    commonShareQuantity: null,
    commonShareValue: null,
    preferredShareQuantity: null,
    preferredShareValue: null,
    renewalStatus: null,
    renewalDate: null,
    principalAddress: null,
    mailingAddress: null,
    bankingAppId: null,
    bankingAppStatus: null,
    bankingAppMessage: null,
    industry: null,
    website: null,
    createdByName: null,
    lastModifiedAt: null,
    lastModifiedByName: null,
    ...partial,
  };
}

// ── Load / persist ──────────────────────────────────────────────────────────

/**
 * Every collection paired with the `store.seq` counter that issues its ids.
 * Used by normalizeLoaded() to back-fill both when an older store.json
 * predates a collection.
 */
const COLLECTION_SEQ: ReadonlyArray<
  readonly [keyof typeof store & string, keyof typeof store.seq]
> = [
  ["accounts", "account"],
  ["contacts", "contact"],
  ["accountContactLinks", "accountContactLink"],
  ["leads", "lead"],
  ["cases", "case"],
  ["tasks", "task"],
  ["documents", "document"],
  ["conversations", "conversation"],
  ["messages", "message"],
  ["caseInteractions", "caseInteraction"],
  ["threadEntries", "threadEntry"],
  ["mentions", "mention"],
  ["users", "user"],
  ["teams", "team"],
  ["sessions", "session"],
  ["automations", "automation"],
];

/**
 * Make a store hydrated from disk safe to write to.
 *
 * loadFromDisk() does Object.assign(store, parsed), which replaces whole
 * objects — including `seq`. A store.json written before a collection existed
 * therefore leaves that collection undefined and, worse, leaves its seq
 * counter undefined, so nextId() would compute `undefined + 1 = NaN` and every
 * new record would be created with id NaN.
 *
 * This runs after the assign and, for each known collection:
 *   - replaces a missing or non-array collection with []
 *   - repairs a missing, non-numeric or too-low seq counter by setting it to
 *     the highest id actually present
 *
 * It is additive: existing data is never dropped or rewritten. Adding a new
 * collection in future means adding one line to COLLECTION_SEQ above.
 */
function normalizeLoaded() {
  for (const [collection, seqKey] of COLLECTION_SEQ) {
    const rows = (store as Record<string, unknown>)[collection];
    if (!Array.isArray(rows)) {
      (store as Record<string, unknown>)[collection] = [];
    }
    const list = (store as Record<string, unknown>)[collection] as Array<{
      id?: unknown;
    }>;
    const highestId = list.reduce(
      (max, row) =>
        typeof row?.id === "number" && Number.isFinite(row.id) && row.id > max
          ? row.id
          : max,
      0,
    );
    const current = store.seq[seqKey];
    if (typeof current !== "number" || !Number.isFinite(current) || current < highestId) {
      store.seq[seqKey] = highestId;
    }
  }

  // caseNumber has no collection of its own — recover it from the case numbers
  // already issued (CASE-001 -> 1) so the next case does not collide.
  if (typeof store.seq.caseNumber !== "number" || !Number.isFinite(store.seq.caseNumber)) {
    store.seq.caseNumber = store.cases.reduce((max, c) => {
      const n = Number(String(c.caseNumber ?? "").replace(/\D/g, ""));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
  }
}

/**
 * Hydrates the store from store.json, migrating it first if it is behind
 * CURRENT_SCHEMA_VERSION (backup + verification + atomic write — see
 * migrations.ts). Returns false when there is no usable file, in which case
 * seed() builds the demo data.
 *
 * A file that exists but cannot be read or parsed, or a migration that cannot
 * be completed safely, STOPS startup (MigrationAbortError) rather than falling
 * back to the seed — the seed would overwrite the file on the next write.
 */
function loadFromDisk(): boolean {
  if (!fs.existsSync(STORE_FILE)) return false;

  let sourceBytes: Buffer;
  let parsed: any;
  try {
    sourceBytes = fs.readFileSync(STORE_FILE);
    parsed = JSON.parse(sourceBytes.toString("utf-8"));
  } catch (err: any) {
    throw new MigrationAbortError(
      `${STORE_FILE} exists but could not be read as JSON (${err?.message ?? err}). ` +
        "Refusing to start so it is not overwritten; restore it from data/backups or store.snapshot.json.",
    );
  }

  // Guard 1: legacy Customer-based schema → re-seed.
  if (Array.isArray((parsed as { customers?: unknown }).customers)) {
    console.warn("[store] legacy schema detected — running fresh seed");
    return false;
  }
  // Guard 2: accounts exist but pre-date the Salesforce-style field set
  // (no `portalId` etc). Re-seed so the new fields show up populated.
  const accs = (parsed as { accounts?: Array<Record<string, unknown>> }).accounts;
  if (Array.isArray(accs) && accs.length > 0 && !("portalId" in accs[0])) {
    console.warn("[store] pre-portal-fields schema detected — running fresh seed");
    return false;
  }

  const result = migrateStoreFile({
    storeFile: STORE_FILE,
    backupDir: BACKUP_DIR,
    sourceBytes,
    data: parsed,
  });
  if (result.status === "migrated") logMigration(result.report);

  Object.assign(store, result.data);
  normalizeLoaded();
  return true;
}

function logMigration(report: import("./migrations.js").MigrationReport) {
  // Deliberately plain console output: this runs before the HTTP logger and
  // must be visible in the terminal that starts the API.
  console.warn(
    `[store] migrated ${report.storeFile} from schema v${report.fromVersion} to v${report.toVersion}\n` +
      `[store]   backup: ${report.backupPath}\n` +
      `[store]   sha256: ${report.sourceSha256} (backup verified)`,
  );
  for (const step of report.steps) {
    console.warn(
      `[store]   step v${step.version} ${step.name}: ${step.users.length} user(s) migrated, ` +
        `${step.demoEmployeesAdded.length} demo employee(s) added, ${step.demoTeamsAdded.length} demo team(s) added`,
    );
    for (const w of step.warnings) console.warn(`[store]   warning: ${w}`);
  }
}

let saveTimer: NodeJS.Timeout | null = null;
export function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
    } catch (err) {
      console.warn("[store] failed to persist:", err);
    }
    saveTimer = null;
  }, 100);
}

export function seed() {
  if (loadFromDisk()) return;

  // ── Users (login accounts) ──────────────────────────────────────────────
  // Existing employees (D1): Iris = System Owner, Devon and Sara = CSR.
  // Passwords are only ever stored hashed.
  const employee = (
    name: string,
    email: string,
    roles: RoleKey[],
    departmentKey: DepartmentKey | null,
    createdAt: string,
  ): User => ({
    id: nextUserId(),
    name,
    email,
    passwordHash: hashPasswordSync(DEMO_PASSWORD),
    roles,
    departmentKey,
    active: true,
    demo: false,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt,
  });
  store.users.push(
    employee("Iris Burgos", "iris@example.com", ["system_owner"], null, daysAgo(60)),
    employee("Devon Park", "devon@example.com", ["csr"], "customer_service", daysAgo(45)),
    employee("Sara Mitchell", "sara@example.com", ["csr"], "customer_service", daysAgo(40)),
  );
  // Demo employees and teams — the same helpers the store migration uses, so
  // a fresh seed and a migrated store end up with identical identities.
  ensureDemoEmployees(store, daysAgo(1));
  ensureDemoTeams(store, daysAgo(1));

  // ── Contacts (people) ───────────────────────────────────────────────────
  // Hassan Patel is the showcase: one contact, linked to THREE accounts.
  // Sofia's PLLC has TWO contacts (both licensed architects).
  // Casa Verde has THREE contacts (founder + two silent investors).
  // Marcus's holdco has TWO contacts (himself + outside counsel).
  const contacts: Contact[] = [
    // Iris's people
    { id: nextContactId(), firstName: "Amelia",   lastName: "Reyes",   email: "amelia@helixlabs.io",         phone: "+1 415 555 0144", title: "Founder",           ownerName: "Iris Burgos",    createdAt: daysAgo(42) },
    { id: nextContactId(), firstName: "Yuki",     lastName: "Tanaka",  email: "yuki@brightlinestudios.com",  phone: "+1 415 555 0182", title: "Creative Director", ownerName: "Iris Burgos",    createdAt: daysAgo(50) },
    { id: nextContactId(), firstName: "Hassan",   lastName: "Patel",   email: "hassan@patelholdings.com",    phone: "+1 307 555 0110", title: "Principal",         ownerName: "Iris Burgos",    createdAt: daysAgo(36) },
    { id: nextContactId(), firstName: "Sofia",    lastName: "Mendoza", email: "sofia@mendozaarch.com",       phone: "+1 415 555 0133", title: "Principal Architect", ownerName: "Iris Burgos",  createdAt: daysAgo(23) },
    { id: nextContactId(), firstName: "Daniel",   lastName: "Park",    email: "daniel@mendozaarch.com",      phone: "+1 415 555 0134", title: "Senior Architect",  ownerName: "Iris Burgos",    createdAt: daysAgo(23) },
    { id: nextContactId(), firstName: "Robert",   lastName: "Chen",    email: "robert@chencapital.com",      phone: "+1 212 555 0107", title: "Managing Partner",  ownerName: "Iris Burgos",    createdAt: daysAgo(19) },

    // Devon's people
    { id: nextContactId(), firstName: "Jordan",   lastName: "Bell",    email: "jordan@northstarlogistics.com", phone: "+1 312 555 0177", title: "COO",          ownerName: "Devon Park",     createdAt: daysAgo(37) },
    { id: nextContactId(), firstName: "Marcus",   lastName: "Cole",    email: "marcus@coleregroup.com",       phone: "+1 213 555 0166", title: "Principal",      ownerName: "Devon Park",     createdAt: daysAgo(15) },
    { id: nextContactId(), firstName: "Elena",    lastName: "Vasquez", email: "elena@vasquezlaw.com",         phone: "+1 213 555 0212", title: "Outside Counsel", ownerName: "Devon Park",    createdAt: daysAgo(14) },
    { id: nextContactId(), firstName: "Marisol",  lastName: "Rivera",  email: "marisol@casaverdetacos.com",   phone: "+1 512 555 0199", title: "Founder & Chef",  ownerName: "Devon Park",    createdAt: daysAgo(12) },
    { id: nextContactId(), firstName: "Diego",    lastName: "Alvarez", email: "diego@casaverdetacos.com",     phone: "+1 512 555 0201", title: "Silent Investor", ownerName: "Devon Park",    createdAt: daysAgo(12) },
    { id: nextContactId(), firstName: "Camila",   lastName: "Ortiz",   email: "camila@casaverdetacos.com",    phone: "+1 512 555 0202", title: "Silent Investor", ownerName: "Devon Park",    createdAt: daysAgo(12) },
    { id: nextContactId(), firstName: "Lucas",    lastName: "Park",    email: "lucas@pinewoodoutfitters.com", phone: "+1 702 555 0173", title: "Founder",         ownerName: "Devon Park",    createdAt: daysAgo(10) },
    { id: nextContactId(), firstName: "Emma",     lastName: "Roth",    email: "emma@rothyoga.com",            phone: "+1 415 555 0193", title: "Founder",         ownerName: "Devon Park",    createdAt: daysAgo(21) },

    // Sara's people
    { id: nextContactId(), firstName: "Priya",    lastName: "Shah",    email: "priya@meridiancoffee.com",     phone: "+1 646 555 0123", title: "Co-Founder",       ownerName: "Sara Mitchell", createdAt: daysAgo(29) },
    { id: nextContactId(), firstName: "Naomi",    lastName: "Shah",    email: "naomi@meridiancoffee.com",     phone: "+1 646 555 0124", title: "Co-Founder",       ownerName: "Sara Mitchell", createdAt: daysAgo(29) },
    { id: nextContactId(), firstName: "Elliot",   lastName: "Marsh",   email: "elliot@cobalthardware.com",    phone: "+1 503 555 0118", title: "Founder",          ownerName: "Sara Mitchell", createdAt: daysAgo(8) },
    { id: nextContactId(), firstName: "Olivia",   lastName: "Chen",    email: "olivia@cloudpeak.io",          phone: "+1 206 555 0142", title: "Founder & CTO",    ownerName: "Sara Mitchell", createdAt: daysAgo(13) },
    { id: nextContactId(), firstName: "Noah",     lastName: "Sterling",email: "noah@sterlingequip.com",       phone: "+1 305 555 0151", title: "Co-Owner",         ownerName: "Sara Mitchell", createdAt: daysAgo(18) },
    { id: nextContactId(), firstName: "Sasha",    lastName: "Brooks",  email: "sasha@sterlingequip.com",      phone: "+1 305 555 0152", title: "Co-Owner",         ownerName: "Sara Mitchell", createdAt: daysAgo(18) },
    { id: nextContactId(), firstName: "Hannah",   lastName: "Wei",     email: "hannah@weiwellness.com",       phone: "+1 408 555 0164", title: "Founder",          ownerName: "Sara Mitchell", createdAt: daysAgo(9) },
  ];
  store.contacts.push(...contacts);
  const [
    amelia, yuki, hassan, sofia, daniel, robert,
    jordan, marcus, elena, marisol, diego, camila, lucas, emma,
    priya, naomi, elliot, olivia, noah, sasha, hannah,
  ] = contacts;

  // ── Accounts (companies) ────────────────────────────────────────────────
  // Hassan has THREE accounts (Patel Holdings, Patel Real Estate, Patel Capital).
  // Each carries a full Salesforce-style record: filing IDs, EINs, addresses,
  // renewal status, banking app, brand, tier, share structure (where used), etc.
  const accounts: Account[] = [
    // ─ Iris's accounts ─
    makeAccount({
      id: nextAccountId(), name: "Helix Labs LLC", ownerName: "Iris Burgos", createdAt: daysAgo(40),
      portalId: 219501, state: "Delaware", entityType: "LLC",
      brand: "Delaware LLC Attorney", subscriptionBundle: "Standard", formationTier: "Professional",
      automationStatus: "Succeeded", stripeId: "cus_S1HelixA42jq",
      formationStatus: "Filed", formationDate: daysAgo(36), firstTransactionDate: daysAgo(36),
      filingId: "DE-2026-040221", ein: "88-3041220",
      companyPhone: "+1 415 555 0144",
      isFormationAutomated: true,
      industry: "Tech / Research", website: "helixlabs.io",
      portalLink: "app.delawarellc.com/dashboard/219501",
      renewalStatus: "Active", renewalDate: daysAgo(-329),
      principalAddress: { line1: "251 Little Falls Drive", city: "Wilmington", state: "DE", zip: "19808", country: "US" },
      mailingAddress: { line1: "548 Market St #62100", city: "San Francisco", state: "CA", zip: "94104", country: "US" },
      bankingAppId: "bk_2bH8nXmpMz1c", bankingAppStatus: "APPROVED",
      createdByName: "Iris Burgos", lastModifiedAt: daysAgo(1), lastModifiedByName: "Iris Burgos",
    }),
    makeAccount({
      id: nextAccountId(), name: "Brightline Studios LLC", ownerName: "Iris Burgos", createdAt: daysAgo(50),
      portalId: 219344, state: "New York", entityType: "LLC",
      brand: "NY LLC Attorney", subscriptionBundle: "Standard", formationTier: "Standard",
      automationStatus: "Succeeded", stripeId: "cus_S2Bright9YxQ",
      formationStatus: "Published", formationDate: daysAgo(46),
      filingId: "NY-2026-1102883", ein: "84-2918340",
      companyPhone: "+1 415 555 0182",
      industry: "Media / Design", website: "brightlinestudios.com",
      portalLink: "app.nyllcattorney.com/dashboard/219344",
      renewalStatus: "Good Standing", renewalDate: daysAgo(-315),
      principalAddress: { line1: "315 Madison Ave Ste 901", city: "New York", state: "NY", zip: "10017", country: "US" },
      mailingAddress: { line1: "315 Madison Ave Ste 901", city: "New York", state: "NY", zip: "10017", country: "US" },
      bankingAppStatus: "NOT_STARTED",
      createdByName: "Iris Burgos", lastModifiedAt: daysAgo(7), lastModifiedByName: "Iris Burgos",
    }),
    makeAccount({
      id: nextAccountId(), name: "Patel Holdings LLC", ownerName: "Iris Burgos", createdAt: daysAgo(34),
      portalId: 219668, state: "Wyoming", entityType: "LLC",
      brand: "Wyoming LLC Attorney", subscriptionBundle: "Standard", formationTier: "Professional",
      automationStatus: "Succeeded", stripeId: "cus_S3Patel88msd",
      formationStatus: "Filed", formationDate: daysAgo(32),
      filingId: "2025-001757012", ein: "88-1923451",
      companyPhone: "+1 307 555 0110",
      abandonedCartUrl: "app.wyomingllcattorney.com/formation/checkout?cart_id=5a273b9f-4786-4709-983c-2a87a6601b34",
      industry: "Investment Holdings", website: "patelholdings.com",
      portalLink: "app.wyomingllcattorney.com/dashboard/219668",
      renewalStatus: "Active", renewalDate: daysAgo(-330),
      principalAddress: { line1: "1309 Coffeen Avenue STE 1200", city: "Sheridan", state: "WY", zip: "82801", country: "US" },
      mailingAddress: { line1: "3303 Little Farms Ct", city: "Richmond", state: "TX", zip: "77406", country: "US" },
      bankingAppId: "aNY2OEKpmqAcWlSaYhhRM", bankingAppStatus: "APPROVED",
      createdByName: "Iris Burgos", lastModifiedAt: daysAgo(2), lastModifiedByName: "Iris Burgos",
    }),
    makeAccount({
      id: nextAccountId(), name: "Patel Real Estate LLC", ownerName: "Iris Burgos", createdAt: daysAgo(120),
      portalId: 215110, state: "Wyoming", entityType: "LLC",
      brand: "Wyoming LLC Attorney", subscriptionBundle: "Standard", formationTier: "Standard",
      automationStatus: "Succeeded", stripeId: "cus_S3Patel88msd",
      formationStatus: "Filed", formationDate: daysAgo(118),
      filingId: "2025-001512080", ein: "87-9881204",
      companyPhone: "+1 307 555 0110",
      industry: "Real Estate",
      portalLink: "app.wyomingllcattorney.com/dashboard/215110",
      renewalStatus: "Administratively Dissolved", renewalDate: daysAgo(-244),
      principalAddress: { line1: "1309 Coffeen Avenue STE 1200", city: "Sheridan", state: "WY", zip: "82801", country: "US" },
      mailingAddress: { line1: "3303 Little Farms Ct", city: "Richmond", state: "TX", zip: "77406", country: "US" },
      bankingAppStatus: "DENIED", bankingAppMessage: "Property-only LLC, no operating activity",
      createdByName: "Platform Integration User", lastModifiedAt: daysAgo(30), lastModifiedByName: "Iris Burgos",
    }),
    makeAccount({
      id: nextAccountId(), name: "Patel Capital LLC", ownerName: "Iris Burgos", createdAt: daysAgo(220),
      portalId: 211889, state: "Delaware", entityType: "LLC",
      brand: "Delaware LLC Attorney", subscriptionBundle: "Premium", formationTier: "Premium",
      automationStatus: "Succeeded", stripeId: "cus_S3Patel88msd",
      formationStatus: "Filed", formationDate: daysAgo(217),
      filingId: "DE-2025-008142", ein: "84-1003118",
      companyPhone: "+1 307 555 0110",
      industry: "Venture Capital",
      shareType: "Membership Units", commonShareQuantity: 10000, commonShareValue: 1,
      portalLink: "app.delawarellc.com/dashboard/211889",
      renewalStatus: "Good Standing", renewalDate: daysAgo(-149),
      principalAddress: { line1: "251 Little Falls Drive", city: "Wilmington", state: "DE", zip: "19808", country: "US" },
      mailingAddress: { line1: "3303 Little Farms Ct", city: "Richmond", state: "TX", zip: "77406", country: "US" },
      bankingAppId: "bk_88pkqACWlSaYhhRM", bankingAppStatus: "APPROVED",
      createdByName: "Platform Integration User", lastModifiedAt: daysAgo(45), lastModifiedByName: "Iris Burgos",
    }),
    makeAccount({
      id: nextAccountId(), name: "Mendoza Architecture PLLC", ownerName: "Iris Burgos", createdAt: daysAgo(22),
      portalId: 220114, state: "California", entityType: "PLLC",
      brand: "California Pro LLC Attorney", subscriptionBundle: "Premium", formationTier: "Premium",
      automationStatus: "Pending", stripeId: "cus_S4MendzPA77",
      formationStatus: "In Review", formationDate: null,
      ein: null,
      companyPhone: "+1 415 555 0133",
      industry: "Architecture", website: "mendozaarch.com",
      portalLink: "app.cacaliforniapro.com/dashboard/220114",
      renewalStatus: null, renewalDate: null,
      principalAddress: { line1: "655 Montgomery St Floor 7", city: "San Francisco", state: "CA", zip: "94111", country: "US" },
      mailingAddress: { line1: "655 Montgomery St Floor 7", city: "San Francisco", state: "CA", zip: "94111", country: "US" },
      bankingAppStatus: "NOT_STARTED",
      createdByName: "Iris Burgos", lastModifiedAt: daysAgo(3), lastModifiedByName: "Iris Burgos",
    }),
    makeAccount({
      id: nextAccountId(), name: "Chen Capital Partners LLC", ownerName: "Iris Burgos", createdAt: daysAgo(18),
      portalId: 220287, state: "Delaware", entityType: "Series LLC",
      brand: "Delaware LLC Attorney", subscriptionBundle: "Premium", formationTier: "Premium",
      automationStatus: "Pending", stripeId: "cus_S5ChenCapA1Q",
      formationStatus: "Drafting", formationDate: null,
      ein: null, companyPhone: "+1 212 555 0107",
      shareType: "Series Interests", commonShareQuantity: null, commonShareValue: null,
      industry: "Fund / Investments", website: "chencapital.com",
      portalLink: "app.delawarellc.com/dashboard/220287",
      principalAddress: { line1: "251 Little Falls Drive", city: "Wilmington", state: "DE", zip: "19808", country: "US" },
      mailingAddress: { line1: "65 East 55th Street Floor 18", city: "New York", state: "NY", zip: "10022", country: "US" },
      bankingAppStatus: "PENDING",
      createdByName: "Iris Burgos", lastModifiedAt: daysAgo(5), lastModifiedByName: "Iris Burgos",
    }),

    // ─ Devon's accounts ─
    makeAccount({
      id: nextAccountId(), name: "Northstar Logistics LLC", ownerName: "Devon Park", createdAt: daysAgo(36),
      portalId: 219612, state: "Wyoming", entityType: "LLC",
      brand: "Wyoming LLC Attorney", subscriptionBundle: "Standard", formationTier: "Professional",
      automationStatus: "Succeeded", stripeId: "cus_S6Northstr",
      formationStatus: "Filed", formationDate: daysAgo(33),
      filingId: "2025-001702145", ein: "92-8814455",
      companyPhone: "+1 312 555 0177",
      industry: "Logistics", website: "northstarlogistics.com",
      portalLink: "app.wyomingllcattorney.com/dashboard/219612",
      renewalStatus: "Active", renewalDate: daysAgo(-332),
      principalAddress: { line1: "1309 Coffeen Avenue STE 1200", city: "Sheridan", state: "WY", zip: "82801", country: "US" },
      mailingAddress: { line1: "350 N State St Ste 1500", city: "Chicago", state: "IL", zip: "60654", country: "US" },
      bankingAppId: "bk_NLogisGq22", bankingAppStatus: "APPROVED",
      createdByName: "Devon Park", lastModifiedAt: daysAgo(2), lastModifiedByName: "Devon Park",
    }),
    makeAccount({
      id: nextAccountId(), name: "Cole Real Estate Group LLC", ownerName: "Devon Park", createdAt: daysAgo(14),
      portalId: 220411, state: "Wyoming", entityType: "LLC",
      brand: "Wyoming LLC Attorney", subscriptionBundle: "Standard", formationTier: "Premium",
      automationStatus: "Pending", stripeId: "cus_S7ColeRE91p",
      formationStatus: "Drafting", formationDate: null,
      companyPhone: "+1 213 555 0166",
      industry: "Real Estate", website: "coleregroup.com",
      portalLink: "app.wyomingllcattorney.com/dashboard/220411",
      principalAddress: { line1: "1309 Coffeen Avenue STE 1200", city: "Sheridan", state: "WY", zip: "82801", country: "US" },
      mailingAddress: { line1: "9663 Santa Monica Blvd Ste 1100", city: "Beverly Hills", state: "CA", zip: "90210", country: "US" },
      bankingAppStatus: "NOT_STARTED",
      createdByName: "Devon Park", lastModifiedAt: daysAgo(1), lastModifiedByName: "Devon Park",
    }),
    makeAccount({
      id: nextAccountId(), name: "Casa Verde Tacos LLC", ownerName: "Devon Park", createdAt: daysAgo(11),
      portalId: 220502, state: "Texas", entityType: "LLC",
      brand: "Texas LLC Attorney", subscriptionBundle: "Standard", formationTier: "Professional",
      automationStatus: "Succeeded", stripeId: "cus_S8CasaVrd7q",
      formationStatus: "Filed", formationDate: daysAgo(8),
      filingId: "TX-805712381", ein: "93-2218904",
      companyPhone: "+1 512 555 0199",
      industry: "Restaurant / Hospitality", website: "casaverdetacos.com",
      portalLink: "app.texasllc.com/dashboard/220502",
      renewalStatus: "Active", renewalDate: daysAgo(-357),
      principalAddress: { line1: "1209 N Lamar Blvd", city: "Austin", state: "TX", zip: "78703", country: "US" },
      mailingAddress: { line1: "1209 N Lamar Blvd", city: "Austin", state: "TX", zip: "78703", country: "US" },
      bankingAppId: "bk_casaTacos02", bankingAppStatus: "PENDING",
      createdByName: "Devon Park", lastModifiedAt: daysAgo(2), lastModifiedByName: "Devon Park",
    }),
    makeAccount({
      id: nextAccountId(), name: "Pinewood Outfitters LLC", ownerName: "Devon Park", createdAt: daysAgo(9),
      portalId: 220578, state: "Nevada", entityType: "LLC",
      brand: "Nevada LLC Attorney", subscriptionBundle: "Premium", formationTier: "Professional",
      automationStatus: "Pending", stripeId: "cus_S9Pinewd33s",
      formationStatus: "In Review", formationDate: null,
      companyPhone: "+1 702 555 0173",
      industry: "Outdoor Retail", website: "pinewoodoutfitters.com",
      portalLink: "app.nevadallc.com/dashboard/220578",
      principalAddress: { line1: "701 S Carson St Ste 200", city: "Carson City", state: "NV", zip: "89701", country: "US" },
      mailingAddress: { line1: "1421 Pine Ridge Ave", city: "Reno", state: "NV", zip: "89509", country: "US" },
      bankingAppStatus: "NOT_STARTED",
      createdByName: "Devon Park", lastModifiedAt: daysAgo(3), lastModifiedByName: "Devon Park",
    }),
    makeAccount({
      id: nextAccountId(), name: "Roth Yoga Collective LLC", ownerName: "Devon Park", createdAt: daysAgo(20),
      portalId: 219771, state: "California", entityType: "LLC",
      brand: "California LLC Attorney", subscriptionBundle: "Basic", formationTier: "Standard",
      automationStatus: "Succeeded", stripeId: "cus_S10RothYg5",
      formationStatus: "Filed", formationDate: daysAgo(360),
      filingId: "CA-202544010188", ein: "82-7710992",
      companyPhone: "+1 415 555 0193",
      industry: "Wellness / Fitness", website: "rothyoga.com",
      portalLink: "app.californiallc.com/dashboard/219771",
      renewalStatus: "Good Standing", renewalDate: daysAgo(-5),
      principalAddress: { line1: "2233 Polk St", city: "San Francisco", state: "CA", zip: "94109", country: "US" },
      mailingAddress: { line1: "2233 Polk St", city: "San Francisco", state: "CA", zip: "94109", country: "US" },
      bankingAppId: "bk_rothYoga44", bankingAppStatus: "APPROVED",
      createdByName: "Devon Park", lastModifiedAt: daysAgo(4), lastModifiedByName: "Devon Park",
    }),

    // ─ Sara's accounts ─
    makeAccount({
      id: nextAccountId(), name: "Meridian Coffee LLC", ownerName: "Sara Mitchell", createdAt: daysAgo(28),
      portalId: 219901, state: "Texas", entityType: "LLC",
      brand: "Texas LLC Attorney", subscriptionBundle: "Standard", formationTier: "Standard",
      automationStatus: "Succeeded", stripeId: "cus_S11Meridn22",
      formationStatus: "Awaiting EIN", formationDate: daysAgo(9),
      filingId: "TX-805844002", ein: null,
      companyPhone: "+1 646 555 0123",
      industry: "Food & Beverage", website: "meridiancoffee.com",
      portalLink: "app.texasllc.com/dashboard/219901",
      principalAddress: { line1: "1810 N Loop 12 #220", city: "Irving", state: "TX", zip: "75061", country: "US" },
      mailingAddress: { line1: "1810 N Loop 12 #220", city: "Irving", state: "TX", zip: "75061", country: "US" },
      bankingAppStatus: "PENDING", bankingAppMessage: "Awaiting EIN confirmation",
      createdByName: "Sara Mitchell", lastModifiedAt: daysAgo(3), lastModifiedByName: "Sara Mitchell",
    }),
    makeAccount({
      id: nextAccountId(), name: "Cobalt Hardware LLC", ownerName: "Sara Mitchell", createdAt: daysAgo(7),
      portalId: 220601, state: "Delaware", entityType: "LLC",
      brand: "Delaware LLC Attorney", subscriptionBundle: "Premium", formationTier: "Premium",
      automationStatus: "Pending", stripeId: "cus_S12CobaltH7",
      formationStatus: "In Review", formationDate: null,
      companyPhone: "+1 503 555 0118",
      industry: "Retail", website: "cobalthardware.com",
      portalLink: "app.delawarellc.com/dashboard/220601",
      principalAddress: { line1: "251 Little Falls Drive", city: "Wilmington", state: "DE", zip: "19808", country: "US" },
      mailingAddress: { line1: "404 SW 6th Ave Ste 1100", city: "Portland", state: "OR", zip: "97204", country: "US" },
      bankingAppStatus: "NOT_STARTED",
      createdByName: "Sara Mitchell", lastModifiedAt: daysAgo(3), lastModifiedByName: "Sara Mitchell",
    }),
    makeAccount({
      id: nextAccountId(), name: "Cloudpeak Software LLC", ownerName: "Sara Mitchell", createdAt: daysAgo(12),
      portalId: 220488, state: "Delaware", entityType: "LLC",
      brand: "Delaware LLC Attorney", subscriptionBundle: "Standard", formationTier: "Professional",
      automationStatus: "Succeeded", stripeId: "cus_S13Cloudpk1",
      formationStatus: "Filed", formationDate: daysAgo(7),
      filingId: "DE-2026-041778", ein: "92-3340081",
      companyPhone: "+1 206 555 0142",
      industry: "SaaS / Software", website: "cloudpeak.io",
      portalLink: "app.delawarellc.com/dashboard/220488",
      renewalStatus: "Active", renewalDate: daysAgo(-358),
      principalAddress: { line1: "251 Little Falls Drive", city: "Wilmington", state: "DE", zip: "19808", country: "US" },
      mailingAddress: { line1: "1201 3rd Ave Ste 2200", city: "Seattle", state: "WA", zip: "98101", country: "US" },
      bankingAppId: "bk_cloudpk09", bankingAppStatus: "APPROVED",
      createdByName: "Sara Mitchell", lastModifiedAt: daysAgo(1), lastModifiedByName: "Sara Mitchell",
    }),
    makeAccount({
      id: nextAccountId(), name: "Sterling Equipment Co LLC", ownerName: "Sara Mitchell", createdAt: daysAgo(17),
      portalId: 220215, state: "Florida", entityType: "LLC",
      brand: "Florida LLC Attorney", subscriptionBundle: "Standard", formationTier: "Standard",
      automationStatus: "Pending", stripeId: "cus_S14Sterlng4",
      formationStatus: "Drafting", formationDate: null,
      companyPhone: "+1 305 555 0151",
      industry: "Equipment Rental", website: "sterlingequip.com",
      portalLink: "app.floridallc.com/dashboard/220215",
      principalAddress: { line1: "201 S Biscayne Blvd Ste 1200", city: "Miami", state: "FL", zip: "33131", country: "US" },
      mailingAddress: { line1: "201 S Biscayne Blvd Ste 1200", city: "Miami", state: "FL", zip: "33131", country: "US" },
      bankingAppStatus: "NOT_STARTED",
      createdByName: "Sara Mitchell", lastModifiedAt: daysAgo(2), lastModifiedByName: "Sara Mitchell",
    }),
    makeAccount({
      id: nextAccountId(), name: "Wei Wellness Studio LLC", ownerName: "Sara Mitchell", createdAt: daysAgo(8),
      portalId: 220559, state: "California", entityType: "LLC",
      brand: "California LLC Attorney", subscriptionBundle: "Basic", formationTier: "Standard",
      automationStatus: "Succeeded", stripeId: "cus_S15WeiWell3",
      formationStatus: "Filed", formationDate: daysAgo(4),
      filingId: "CA-202544022907", ein: "85-9012883",
      companyPhone: "+1 408 555 0164",
      industry: "Wellness / Fitness", website: "weiwellness.com",
      portalLink: "app.californiallc.com/dashboard/220559",
      renewalStatus: "Active", renewalDate: daysAgo(-361),
      principalAddress: { line1: "175 W Santa Clara St Ste 1200", city: "San Jose", state: "CA", zip: "95113", country: "US" },
      mailingAddress: { line1: "175 W Santa Clara St Ste 1200", city: "San Jose", state: "CA", zip: "95113", country: "US" },
      bankingAppStatus: "PENDING",
      createdByName: "Sara Mitchell", lastModifiedAt: daysAgo(1), lastModifiedByName: "Sara Mitchell",
    }),
  ];
  store.accounts.push(...accounts);
  const [
    aHelix, aBrightline, aPatelHoldings, aPatelRE, aPatelCap, aMendoza, aChen,
    aNorthstar, aColeRE, aCasaVerde, aPinewood, aRoth,
    aMeridian, aCobalt, aCloudpeak, aSterling, aWei,
  ] = accounts;

  // ── Account-Contact Links (with roles & ownership %) ────────────────────
  const link = (
    accountId: number,
    contactId: number,
    role: string,
    ownershipPct: number | null,
    isPrimary: boolean,
    isSignatory: boolean,
    daysBack: number,
  ): AccountContactLink => ({
    id: nextAccountContactLinkId(),
    accountId,
    contactId,
    role,
    ownershipPct,
    isPrimary,
    isSignatory,
    startedAt: daysAgo(daysBack),
    endedAt: null,
  });

  store.accountContactLinks.push(
    // Helix Labs — single-member
    link(aHelix.id, amelia.id, "Sole Member / Manager", 100, true, true, 40),
    // Brightline Studios — single-member
    link(aBrightline.id, yuki.id, "Sole Member", 100, true, true, 50),
    // Hassan's 3 LLCs — same contact, different roles
    link(aPatelHoldings.id, hassan.id, "Sole Member / Manager", 100, true, true, 34),
    link(aPatelRE.id, hassan.id, "Managing Member", 100, true, true, 120),
    link(aPatelCap.id, hassan.id, "Managing Member", 100, true, true, 220),
    // Mendoza PLLC — two licensed-architect members
    link(aMendoza.id, sofia.id, "Principal Architect / Member", 60, true, true, 22),
    link(aMendoza.id, daniel.id, "Senior Architect / Member", 40, false, true, 22),
    // Chen Capital — single Managing Partner
    link(aChen.id, robert.id, "Managing Partner", 100, true, true, 18),
    // Northstar Logistics
    link(aNorthstar.id, jordan.id, "COO / Operating Member", 50, true, true, 36),
    // Cole Real Estate Group + outside counsel
    link(aColeRE.id, marcus.id, "Sole Member", 100, true, true, 14),
    link(aColeRE.id, elena.id, "Outside Counsel", null, false, false, 14),
    // Casa Verde Tacos — 3 members
    link(aCasaVerde.id, marisol.id, "Founder / Managing Member", 60, true, true, 11),
    link(aCasaVerde.id, diego.id,   "Silent Investor / Member", 20, false, false, 11),
    link(aCasaVerde.id, camila.id,  "Silent Investor / Member", 20, false, false, 11),
    // Pinewood Outfitters
    link(aPinewood.id, lucas.id, "Sole Member", 100, true, true, 9),
    // Roth Yoga — Emma post-buyout
    link(aRoth.id, emma.id, "Sole Member (post-buyout)", 100, true, true, 20),
    // Meridian Coffee — co-founders
    link(aMeridian.id, priya.id, "Co-Founder / Member", 50, true, true, 28),
    link(aMeridian.id, naomi.id, "Co-Founder / Member", 50, false, true, 28),
    // Cobalt Hardware
    link(aCobalt.id, elliot.id, "Sole Member", 100, true, true, 7),
    // Cloudpeak Software
    link(aCloudpeak.id, olivia.id, "Sole Member / Manager", 100, true, true, 12),
    // Sterling Equipment — 2 co-owners
    link(aSterling.id, noah.id,  "Co-Owner / Member", 50, true, true, 17),
    link(aSterling.id, sasha.id, "Co-Owner / Member", 50, false, true, 17),
    // Wei Wellness
    link(aWei.id, hannah.id, "Sole Member", 100, true, true, 8),
  );

  // ── Cases (one primary case per account, mirroring the previous seed) ──
  const cases: Case[] = [
    // Iris's queue (5 — Helix, Brightline, Patel Holdings, Mendoza, Chen)
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Delaware Articles of Organization — Helix Labs LLC",
      accountId: aHelix.id, primaryContactId: amelia.id,
      status: "in_progress", priority: "high",
      description:
        "Forming Helix Labs LLC in Delaware. Drafting the Certificate of Formation, appointing Corporate Service Company (CSC) as Delaware registered agent, and filing with the DE Division of Corporations ($110). Single-member LLC, pass-through taxation, $300 annual franchise tax.",
      tags: ["DE", "articles-of-organization", "registered-agent", "single-member"],
      ownerName: "Iris Burgos", createdAt: daysAgo(22), updatedAt: daysAgo(1),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "New York Publication Requirement — Brightline Studios LLC",
      accountId: aBrightline.id, primaryContactId: yuki.id,
      status: "completed", priority: "medium",
      description:
        "Brightline Studios LLC formed in New York County. Completed the mandatory 6-week publication in two newspapers designated by the County Clerk (one daily + one weekly). Filed the Certificate of Publication and affidavits of publication with the NY Department of State.",
      tags: ["NY", "publication", "certificate-of-publication", "formation"],
      ownerName: "Iris Burgos", createdAt: daysAgo(45), updatedAt: daysAgo(7),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Wyoming Single-Member Formation — Patel Holdings LLC",
      accountId: aPatelHoldings.id, primaryContactId: hassan.id,
      status: "intake", priority: "medium",
      description:
        "Forming Patel Holdings LLC in Wyoming for passive investment holdings. Wyoming's $100 filing fee + $60 annual report is the lowest in the country. Anonymous ownership permitted — only the registered agent appears on the public record. Targeting Northwest Registered Agent. Will draft a one-member operating agreement focused on holdco/investment provisions.",
      tags: ["WY", "articles-of-organization", "single-member", "holdco", "anonymous"],
      ownerName: "Iris Burgos", createdAt: daysAgo(4), updatedAt: daysAgo(2),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "California PLLC Formation — Mendoza Architecture PLLC",
      accountId: aMendoza.id, primaryContactId: sofia.id,
      status: "review", priority: "high",
      description:
        "Sofia is a licensed architect in California — by law, professional services must use a Professional LLC (PLLC) rather than a standard LLC. Filing Articles of Organization (Form LLC-1) plus a Professional Limited Liability Company election with the California Architects Board. All members must hold active CA architect licenses. $70 SOS filing fee + $800 annual franchise tax.",
      tags: ["CA", "pllc", "professional", "articles-of-organization", "form-llc-1"],
      ownerName: "Iris Burgos", createdAt: daysAgo(22), updatedAt: daysAgo(3),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Delaware Series LLC Structure — Chen Capital Partners LLC",
      accountId: aChen.id, primaryContactId: robert.id,
      status: "waiting", priority: "low",
      description:
        "Setting up a Delaware Series LLC for Chen Capital. Master LLC + protected internal series for each fund vehicle. Each series can hold separate assets and liabilities with internal liability isolation, but only the master files at the state level. Drafting the master Operating Agreement and per-series designation memoranda. Awaiting client confirmation on initial number of series.",
      tags: ["DE", "series-llc", "operating-agreement", "fund-formation"],
      ownerName: "Iris Burgos", createdAt: daysAgo(18), updatedAt: daysAgo(5),
    },

    // Devon's queue (5)
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "California Foreign Qualification — Northstar Logistics LLC",
      accountId: aNorthstar.id, primaryContactId: jordan.id,
      status: "review", priority: "medium",
      description:
        "Northstar Logistics LLC (Wyoming-formed) is opening a freight hub in Long Beach. Filing Form LLC-5 (Application to Register a Foreign LLC) with the CA Secretary of State, designating a California registered agent, and registering with the CA Franchise Tax Board for the $800 annual minimum tax. Statement of Information (Form LLC-12) follows within 90 days.",
      tags: ["CA", "WY", "foreign-qualification", "form-llc-5", "franchise-tax"],
      ownerName: "Devon Park", createdAt: daysAgo(14), updatedAt: daysAgo(2),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Wyoming Holdco Formation — Cole Real Estate Group LLC",
      accountId: aColeRE.id, primaryContactId: marcus.id,
      status: "in_progress", priority: "critical",
      description:
        "Forming a Wyoming holding LLC for asset protection (anonymous ownership, $60 annual report). Marcus holds investment properties in FL, AZ, and NV — once the WY holdco is filed, the FL/AZ/NV foreign qualifications follow as separate matters. Each requires a Certificate of Good Standing from Wyoming. Critical timing: Marcus closes on FL property in 3 weeks.",
      tags: ["WY", "articles-of-organization", "holdco", "real-estate", "asset-protection"],
      ownerName: "Devon Park", createdAt: daysAgo(4), updatedAt: daysAgo(1),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Texas Certificate of Formation — Casa Verde Tacos LLC",
      accountId: aCasaVerde.id, primaryContactId: marisol.id,
      status: "in_progress", priority: "medium",
      description:
        "Forming Casa Verde Tacos LLC in Texas — three-member structure (founder + two silent investors). Filing Form 205 (Certificate of Formation) with TX SOS, $300 filing fee. Drafting multi-member Operating Agreement with profit allocation and capital contribution schedule. CT Corporation appointed as TX registered agent. Will follow with EIN and Texas Comptroller franchise tax registration.",
      tags: ["TX", "form-205", "certificate-of-formation", "multi-member", "restaurant"],
      ownerName: "Devon Park", createdAt: daysAgo(11), updatedAt: daysAgo(2),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Nevada LLC Formation — Pinewood Outfitters LLC",
      accountId: aPinewood.id, primaryContactId: lucas.id,
      status: "intake", priority: "medium",
      description:
        "Forming Pinewood Outfitters LLC in Nevada. Lucas wants Nevada specifically for the privacy posture (no public member disclosure) and the absence of state income tax. Filing Articles of Organization + initial List of Managers/Members ($425 combined) with NV Secretary of State. Annual list + business license renewal: $350. Engaging Northwest Registered Agent as the NV resident agent.",
      tags: ["NV", "articles-of-organization", "single-member", "outdoor-retail"],
      ownerName: "Devon Park", createdAt: daysAgo(9), updatedAt: daysAgo(3),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Operating Agreement Amendment + Member Buyout — Roth Yoga Collective LLC",
      accountId: aRoth.id, primaryContactId: emma.id,
      status: "in_progress", priority: "low",
      description:
        "Emma is buying out her departing co-founder. Drafting an amendment to the Operating Agreement: revised capital accounts, redemption of the departing member's units, and new sole-member governance provisions. Buyout structured as a 24-month installment per the original OA's redemption clause. State filings: none required (operating agreement is internal), but new EIN-on-file member info will go to Wells Fargo.",
      tags: ["CA", "operating-agreement", "member-buyout", "amendment"],
      ownerName: "Devon Park", createdAt: daysAgo(20), updatedAt: daysAgo(4),
    },

    // Sara's queue (5)
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "EIN Application & Operating Agreement — Meridian Coffee LLC",
      accountId: aMeridian.id, primaryContactId: priya.id,
      status: "waiting", priority: "low",
      description:
        "Meridian Coffee LLC formed in Texas last week. Submitted IRS Form SS-4 to obtain an Employer Identification Number — awaiting CP 575 confirmation letter (typical 1–2 weeks). Drafting a multi-member Operating Agreement with profit/loss allocation, capital contributions, and member voting thresholds. Once EIN arrives, opening business bank account with Chase.",
      tags: ["TX", "ein", "form-ss-4", "operating-agreement", "multi-member"],
      ownerName: "Sara Mitchell", createdAt: daysAgo(9), updatedAt: daysAgo(3),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Delaware Formation + Same-Day EIN — Cobalt Hardware LLC",
      accountId: aCobalt.id, primaryContactId: elliot.id,
      status: "intake", priority: "high",
      description:
        "Single-member Delaware LLC formation for a hardware retail expansion. Filing Certificate of Formation with DE Division of Corporations ($110 + $50 24-hour expedite). CSC appointed as Delaware registered agent. Elliot needs an EIN immediately to open a Mercury business account — applying via IRS online portal the same day the DE filing confirms. End-to-end target: 10 days.",
      tags: ["DE", "articles-of-organization", "ein", "form-ss-4", "single-member", "retail"],
      ownerName: "Sara Mitchell", createdAt: daysAgo(3), updatedAt: daysAgo(3),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Delaware Single-Member Formation — Cloudpeak Software LLC",
      accountId: aCloudpeak.id, primaryContactId: olivia.id,
      status: "in_progress", priority: "high",
      description:
        "Forming Cloudpeak Software LLC in Delaware — single-member tech company, founder based in Seattle. DE chosen for investor familiarity (likely series-funded later). Drafting Certificate of Formation, appointing Harvard Business Services as DE registered agent ($55/yr), and preparing a disregarded-entity tax election filing. EIN application via Form SS-4 follows formation confirmation.",
      tags: ["DE", "articles-of-organization", "single-member", "software", "disregarded-entity"],
      ownerName: "Sara Mitchell", createdAt: daysAgo(12), updatedAt: daysAgo(1),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "Florida LLC Formation — Sterling Equipment Co LLC",
      accountId: aSterling.id, primaryContactId: noah.id,
      status: "review", priority: "medium",
      description:
        "Forming Sterling Equipment Co LLC in Florida — heavy equipment rental, two-member structure. Filing FL Articles of Organization ($125, includes designation of registered agent + initial annual report) with the FL Division of Corporations. Drafting two-member Operating Agreement with profit split, working-capital contribution schedule, and unanimous consent on equipment purchases >$50K.",
      tags: ["FL", "articles-of-organization", "multi-member", "equipment-rental"],
      ownerName: "Sara Mitchell", createdAt: daysAgo(17), updatedAt: daysAgo(2),
    },
    {
      id: nextCaseId(), caseNumber: nextCaseNumber(),
      title: "California Formation + Statement of Information — Wei Wellness Studio LLC",
      accountId: aWei.id, primaryContactId: hannah.id,
      status: "in_progress", priority: "medium",
      description:
        "Forming Wei Wellness Studio LLC in California — single-member yoga + wellness studio in San Jose. Filing CA Form LLC-1 (Articles of Organization, $70). Statement of Information (Form LLC-12) due within 90 days of formation ($20, biennial thereafter). Hannah is exempt from the first-year $800 franchise tax under the 2021 AB-85 exemption — calendaring the second-year payment as a reminder.",
      tags: ["CA", "form-llc-1", "form-llc-12", "single-member", "franchise-tax-exemption"],
      ownerName: "Sara Mitchell", createdAt: daysAgo(8), updatedAt: daysAgo(1),
    },
  ];
  store.cases.push(...cases);
  const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15] = cases;

  // ── Tasks (3–5 per case) ────────────────────────────────────────────────
  store.tasks.push(
    { id: nextTaskId(), caseId: c1.id, title: "Reserve 'Helix Labs LLC' with DE Division of Corporations", description: null, status: "completed", dueDate: daysAgo(20), createdAt: daysAgo(22) },
    { id: nextTaskId(), caseId: c1.id, title: "Draft Certificate of Formation (v2)", description: "Single-member, perpetual duration.", status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(18) },
    { id: nextTaskId(), caseId: c1.id, title: "Confirm CSC as registered agent", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(15) },
    { id: nextTaskId(), caseId: c1.id, title: "File Certificate of Formation with DE ($110)", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(12) },
    { id: nextTaskId(), caseId: c1.id, title: "Apply for EIN (Form SS-4) once DE confirms", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(10) },

    { id: nextTaskId(), caseId: c2.id, title: "Get newspaper designations from County Clerk", description: null, status: "completed", dueDate: daysAgo(40), createdAt: daysAgo(45) },
    { id: nextTaskId(), caseId: c2.id, title: "Run 6-week publication (one daily + one weekly)", description: null, status: "completed", dueDate: daysAgo(10), createdAt: daysAgo(40) },
    { id: nextTaskId(), caseId: c2.id, title: "File Certificate of Publication with NY DOS", description: null, status: "completed", dueDate: daysAgo(8), createdAt: daysAgo(10) },

    { id: nextTaskId(), caseId: c3.id, title: "Verify entity name 'Patel Holdings LLC' with WY SOS", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(4) },
    { id: nextTaskId(), caseId: c3.id, title: "Engage Northwest Registered Agent (WY)", description: null, status: "pending", dueDate: daysAgo(-4), createdAt: daysAgo(3) },
    { id: nextTaskId(), caseId: c3.id, title: "File WY Articles of Organization ($100)", description: null, status: "pending", dueDate: daysAgo(-6), createdAt: daysAgo(3) },
    { id: nextTaskId(), caseId: c3.id, title: "Draft holdco-focused Operating Agreement", description: null, status: "pending", dueDate: daysAgo(-10), createdAt: daysAgo(2) },

    { id: nextTaskId(), caseId: c4.id, title: "Confirm all members hold active CA architect licenses", description: null, status: "completed", dueDate: daysAgo(18), createdAt: daysAgo(22) },
    { id: nextTaskId(), caseId: c4.id, title: "Draft Form LLC-1 with PLLC election", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(15) },
    { id: nextTaskId(), caseId: c4.id, title: "Submit professional services attestation to CA Architects Board", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(10) },
    { id: nextTaskId(), caseId: c4.id, title: "File LLC-1 with CA Secretary of State ($70)", description: null, status: "pending", dueDate: daysAgo(-9), createdAt: daysAgo(8) },
    { id: nextTaskId(), caseId: c4.id, title: "Register for $800 minimum franchise tax", description: null, status: "pending", dueDate: daysAgo(-30), createdAt: daysAgo(6) },

    { id: nextTaskId(), caseId: c5.id, title: "Confirm number of initial series with client", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(18) },
    { id: nextTaskId(), caseId: c5.id, title: "Draft master Operating Agreement with series provisions", description: null, status: "in_progress", dueDate: daysAgo(-7), createdAt: daysAgo(14) },
    { id: nextTaskId(), caseId: c5.id, title: "Draft per-series designation memoranda templates", description: null, status: "pending", dueDate: daysAgo(-10), createdAt: daysAgo(10) },
    { id: nextTaskId(), caseId: c5.id, title: "File DE Certificate of Formation ($110)", description: null, status: "pending", dueDate: daysAgo(-14), createdAt: daysAgo(8) },

    { id: nextTaskId(), caseId: c6.id, title: "Obtain Certificate of Good Standing from Wyoming", description: null, status: "completed", dueDate: daysAgo(12), createdAt: daysAgo(14) },
    { id: nextTaskId(), caseId: c6.id, title: "Draft Form LLC-5 (Application to Register Foreign LLC)", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(10) },
    { id: nextTaskId(), caseId: c6.id, title: "Designate California registered agent", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(9) },
    { id: nextTaskId(), caseId: c6.id, title: "File Form LLC-5 with CA SOS ($70)", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(8) },
    { id: nextTaskId(), caseId: c6.id, title: "Register with CA Franchise Tax Board ($800/yr)", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(8) },

    { id: nextTaskId(), caseId: c7.id, title: "Verify entity name 'Cole RE Holdings LLC' in WY", description: null, status: "in_progress", dueDate: daysAgo(-1), createdAt: daysAgo(4) },
    { id: nextTaskId(), caseId: c7.id, title: "Appoint WY registered agent", description: null, status: "pending", dueDate: daysAgo(-3), createdAt: daysAgo(4) },
    { id: nextTaskId(), caseId: c7.id, title: "File WY Articles of Organization ($100)", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(4) },
    { id: nextTaskId(), caseId: c7.id, title: "Draft single-member holdco Operating Agreement", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(3) },

    { id: nextTaskId(), caseId: c8.id, title: "Confirm 'Casa Verde Tacos LLC' availability with TX SOS", description: null, status: "completed", dueDate: daysAgo(9), createdAt: daysAgo(11) },
    { id: nextTaskId(), caseId: c8.id, title: "Draft Form 205 (Certificate of Formation)", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(7) },
    { id: nextTaskId(), caseId: c8.id, title: "Engage CT Corporation as TX registered agent", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(6) },
    { id: nextTaskId(), caseId: c8.id, title: "File Form 205 with TX SOS ($300 + $25 expedite)", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(5) },
    { id: nextTaskId(), caseId: c8.id, title: "Draft 3-member Operating Agreement", description: null, status: "pending", dueDate: daysAgo(-10), createdAt: daysAgo(4) },

    { id: nextTaskId(), caseId: c9.id, title: "Confirm 'Pinewood Outfitters LLC' availability with NV SOS", description: null, status: "completed", dueDate: daysAgo(7), createdAt: daysAgo(9) },
    { id: nextTaskId(), caseId: c9.id, title: "Engage Northwest Registered Agent (NV resident agent)", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(6) },
    { id: nextTaskId(), caseId: c9.id, title: "File NV Articles of Organization + Initial List ($425)", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(5) },
    { id: nextTaskId(), caseId: c9.id, title: "Pay NV state business license fee ($200)", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(4) },

    { id: nextTaskId(), caseId: c10.id, title: "Review original Operating Agreement redemption clause", description: null, status: "completed", dueDate: daysAgo(15), createdAt: daysAgo(20) },
    { id: nextTaskId(), caseId: c10.id, title: "Draft OA amendment + redemption agreement", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(10) },
    { id: nextTaskId(), caseId: c10.id, title: "Update IRS on member info (Form 8822-B)", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(5) },
    { id: nextTaskId(), caseId: c10.id, title: "Notify Wells Fargo of governance change", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(3) },

    { id: nextTaskId(), caseId: c11.id, title: "Submit IRS Form SS-4 online", description: null, status: "completed", dueDate: daysAgo(6), createdAt: daysAgo(9) },
    { id: nextTaskId(), caseId: c11.id, title: "Receive CP 575 EIN confirmation letter", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(6) },
    { id: nextTaskId(), caseId: c11.id, title: "Finalize multi-member Operating Agreement", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(5) },
    { id: nextTaskId(), caseId: c11.id, title: "Open Chase business bank account", description: null, status: "pending", dueDate: daysAgo(-10), createdAt: daysAgo(5) },

    { id: nextTaskId(), caseId: c12.id, title: "Verify name availability with DE", description: null, status: "completed", dueDate: daysAgo(2), createdAt: daysAgo(3) },
    { id: nextTaskId(), caseId: c12.id, title: "Draft Certificate of Formation", description: null, status: "in_progress", dueDate: daysAgo(-1), createdAt: daysAgo(2) },
    { id: nextTaskId(), caseId: c12.id, title: "Engage CSC as DE registered agent", description: null, status: "pending", dueDate: daysAgo(-2), createdAt: daysAgo(2) },
    { id: nextTaskId(), caseId: c12.id, title: "File DE Certificate of Formation ($110 + $50 expedite)", description: null, status: "pending", dueDate: daysAgo(-3), createdAt: daysAgo(2) },
    { id: nextTaskId(), caseId: c12.id, title: "Apply for EIN same-day via IRS online portal", description: null, status: "pending", dueDate: daysAgo(-3), createdAt: daysAgo(1) },

    { id: nextTaskId(), caseId: c13.id, title: "Confirm 'Cloudpeak Software LLC' availability with DE", description: null, status: "completed", dueDate: daysAgo(10), createdAt: daysAgo(12) },
    { id: nextTaskId(), caseId: c13.id, title: "Draft Certificate of Formation", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(8) },
    { id: nextTaskId(), caseId: c13.id, title: "Engage Harvard Business Services as DE registered agent", description: null, status: "in_progress", dueDate: daysAgo(-3), createdAt: daysAgo(6) },
    { id: nextTaskId(), caseId: c13.id, title: "File Certificate of Formation with DE ($110)", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(4) },
    { id: nextTaskId(), caseId: c13.id, title: "Apply for EIN (Form SS-4)", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(3) },

    { id: nextTaskId(), caseId: c14.id, title: "Confirm name availability with FL Division of Corporations", description: null, status: "completed", dueDate: daysAgo(15), createdAt: daysAgo(17) },
    { id: nextTaskId(), caseId: c14.id, title: "Draft FL Articles of Organization", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(12) },
    { id: nextTaskId(), caseId: c14.id, title: "File Articles with FL Division of Corporations ($125)", description: null, status: "pending", dueDate: daysAgo(-4), createdAt: daysAgo(8) },
    { id: nextTaskId(), caseId: c14.id, title: "Draft 2-member Operating Agreement with equipment-purchase consent threshold", description: null, status: "pending", dueDate: daysAgo(-7), createdAt: daysAgo(6) },

    { id: nextTaskId(), caseId: c15.id, title: "Confirm 'Wei Wellness Studio LLC' availability with CA", description: null, status: "completed", dueDate: daysAgo(6), createdAt: daysAgo(8) },
    { id: nextTaskId(), caseId: c15.id, title: "Draft & file CA Form LLC-1 ($70)", description: null, status: "in_progress", dueDate: daysAgo(-2), createdAt: daysAgo(5) },
    { id: nextTaskId(), caseId: c15.id, title: "Draft single-member Operating Agreement", description: null, status: "pending", dueDate: daysAgo(-5), createdAt: daysAgo(4) },
    { id: nextTaskId(), caseId: c15.id, title: "File Statement of Information (LLC-12) within 90 days", description: null, status: "pending", dueDate: daysAgo(-80), createdAt: daysAgo(3) },
  );

  // ── Documents ───────────────────────────────────────────────────────────
  store.documents.push(
    { id: nextDocumentId(), caseId: c1.id, filename: "DE-Certificate-of-Formation-v2.docx",     fileUrl: "https://example.com/docs/de-cof-v2.docx",      type: "contract", size: 48211,  tags: ["DE", "draft", "v2"],            createdAt: daysAgo(18) },
    { id: nextDocumentId(), caseId: c1.id, filename: "CSC-Registered-Agent-Acceptance.pdf",     fileUrl: "https://example.com/docs/csc-ra.pdf",          type: "contract", size: 28140,  tags: ["DE", "registered-agent"],       createdAt: daysAgo(15) },
    { id: nextDocumentId(), caseId: c2.id, filename: "NY-Certificate-of-Publication.pdf",       fileUrl: "https://example.com/docs/ny-cop.pdf",          type: "identity", size: 31200,  tags: ["NY", "publication"],             createdAt: daysAgo(8) },
    { id: nextDocumentId(), caseId: c2.id, filename: "NY-Affidavits-of-Publication.pdf",        fileUrl: "https://example.com/docs/ny-affidavits.pdf",   type: "identity", size: 92044,  tags: ["NY", "publication", "affidavit"], createdAt: daysAgo(10) },
    { id: nextDocumentId(), caseId: c4.id, filename: "CA-PLLC-Election-Draft.pdf",              fileUrl: "https://example.com/docs/ca-pllc.pdf",         type: "report",   size: 71200,  tags: ["CA", "pllc", "draft"],           createdAt: daysAgo(12) },
    { id: nextDocumentId(), caseId: c5.id, filename: "Chen-Capital-Master-OA-Draft.docx",       fileUrl: "https://example.com/docs/chen-master-oa.docx", type: "contract", size: 224310, tags: ["DE", "series-llc", "draft"],     createdAt: daysAgo(10) },
    { id: nextDocumentId(), caseId: c6.id, filename: "WY-Certificate-of-Good-Standing.pdf",     fileUrl: "https://example.com/docs/wy-good-standing.pdf",type: "identity", size: 89234,  tags: ["WY", "good-standing"],           createdAt: daysAgo(12) },
    { id: nextDocumentId(), caseId: c6.id, filename: "CA-Form-LLC-5-Draft.pdf",                 fileUrl: "https://example.com/docs/ca-llc5.pdf",         type: "report",   size: 134580, tags: ["CA", "form-llc-5", "draft"],     createdAt: daysAgo(8) },
    { id: nextDocumentId(), caseId: c8.id, filename: "Casa-Verde-Form-205-Draft.pdf",           fileUrl: "https://example.com/docs/casa-form-205.pdf",   type: "report",   size: 82110,  tags: ["TX", "form-205", "draft"],       createdAt: daysAgo(6) },
    { id: nextDocumentId(), caseId: c11.id, filename: "IRS-Form-SS-4-Submitted.pdf",            fileUrl: "https://example.com/docs/ss-4.pdf",            type: "report",   size: 64210,  tags: ["IRS", "ein", "form-ss-4"],       createdAt: daysAgo(6) },
    { id: nextDocumentId(), caseId: c11.id, filename: "Meridian-Operating-Agreement-v1.docx",   fileUrl: "https://example.com/docs/meridian-oa.docx",    type: "contract", size: 184550, tags: ["TX", "operating-agreement"],     createdAt: daysAgo(5) },
    { id: nextDocumentId(), caseId: c14.id, filename: "Sterling-FL-Articles-Draft.pdf",         fileUrl: "https://example.com/docs/sterling-fl.pdf",     type: "report",   size: 56400,  tags: ["FL", "articles-of-organization", "draft"], createdAt: daysAgo(10) },
  );

  // ── Case interactions (phone/email/meeting logs) ────────────────────────
  store.caseInteractions.push(
    { id: nextCaseInteractionId(), caseId: c1.id, direction: "outbound", channel: "email",   summary: "Sent draft Certificate of Formation for Helix Labs LLC for Amelia's sign-off.", contact: "Amelia Reyes", byName: "Iris Burgos", createdAt: daysAgo(18) },
    { id: nextCaseInteractionId(), caseId: c1.id, direction: "inbound",  channel: "email",   summary: "Amelia confirmed entity name and provided single-member info.",                 contact: "Amelia Reyes", byName: "Iris Burgos", createdAt: daysAgo(16) },
    { id: nextCaseInteractionId(), caseId: c3.id, direction: "inbound",  channel: "phone",   summary: "Hassan walked through his investment portfolio — confirmed WY for anonymity + low fees.", contact: "Hassan Patel",  byName: "Iris Burgos", createdAt: daysAgo(4) },
    { id: nextCaseInteractionId(), caseId: c4.id, direction: "outbound", channel: "email",   summary: "Sent CA PLLC checklist + verified all members' active architect licenses.",       contact: "Sofia Mendoza", byName: "Iris Burgos", createdAt: daysAgo(18) },
    { id: nextCaseInteractionId(), caseId: c5.id, direction: "outbound", channel: "meeting", summary: "Working session on Series LLC structure — Robert confirmed 3 initial series.",   contact: "Robert Chen",  byName: "Iris Burgos", createdAt: daysAgo(14) },
    { id: nextCaseInteractionId(), caseId: c6.id, direction: "outbound", channel: "email",   summary: "Walked Jordan through CA foreign qualification + $800 franchise tax surprise.", contact: "Jordan Bell",  byName: "Devon Park", createdAt: daysAgo(11) },
    { id: nextCaseInteractionId(), caseId: c7.id, direction: "inbound",  channel: "phone",   summary: "Initial consult with Marcus on WY holdco + 3-state foreign qualification strategy.", contact: "Marcus Cole", byName: "Devon Park", createdAt: daysAgo(4) },
    { id: nextCaseInteractionId(), caseId: c8.id, direction: "inbound",  channel: "meeting", summary: "Kickoff with Marisol + two silent investors. Confirmed 3-member structure.",     contact: "Marisol Rivera", byName: "Devon Park", createdAt: daysAgo(10) },
    { id: nextCaseInteractionId(), caseId: c9.id, direction: "outbound", channel: "email",   summary: "Sent NV state filing fees breakdown — confirmed Lucas wants NV for privacy.",   contact: "Lucas Park",   byName: "Devon Park", createdAt: daysAgo(7) },
    { id: nextCaseInteractionId(), caseId: c10.id, direction: "inbound", channel: "phone",   summary: "Emma confirmed buyout terms — 24-month installment per original OA redemption clause.", contact: "Emma Roth", byName: "Devon Park", createdAt: daysAgo(15) },
    { id: nextCaseInteractionId(), caseId: c11.id, direction: "inbound", channel: "phone",   summary: "Priya asked when EIN should arrive — explained IRS 1–2 week turnaround.",        contact: "Priya Shah",   byName: "Sara Mitchell", createdAt: daysAgo(5) },
    { id: nextCaseInteractionId(), caseId: c12.id, direction: "inbound", channel: "phone",   summary: "Initial consult — Elliot wants formation + EIN done in 10 days for Mercury account.", contact: "Elliot Marsh", byName: "Sara Mitchell", createdAt: daysAgo(3) },
    { id: nextCaseInteractionId(), caseId: c13.id, direction: "outbound", channel: "email",  summary: "Sent Olivia the DE registered-agent comparison: Harvard ($55) vs CSC ($350).",   contact: "Olivia Chen",  byName: "Sara Mitchell", createdAt: daysAgo(9) },
    { id: nextCaseInteractionId(), caseId: c14.id, direction: "outbound", channel: "email",  summary: "Sent Noah the 2-member OA draft with equipment-purchase consent threshold ($50K).", contact: "Noah Sterling", byName: "Sara Mitchell", createdAt: daysAgo(12) },
    { id: nextCaseInteractionId(), caseId: c15.id, direction: "outbound", channel: "email",  summary: "Walked Hannah through CA AB-85 first-year franchise tax exemption.",              contact: "Hannah Wei",   byName: "Sara Mitchell", createdAt: daysAgo(6) },
  );

  // ── Thread entries (team-only commentary) ────────────────────────────────
  store.threadEntries.push(
    { id: nextThreadEntryId(), caseId: c1.id, authorName: "Iris Burgos",   body: "Kicked off Helix DE formation — Amelia confirmed 'Helix Labs LLC' as the entity name.",   createdAt: daysAgo(22) },
    { id: nextThreadEntryId(), caseId: c1.id, authorName: "Iris Burgos",   body: "Once DE confirms filing, we'll fire off the SS-4 for the EIN. End of next week target.",  createdAt: daysAgo(2) },
    { id: nextThreadEntryId(), caseId: c3.id, authorName: "Iris Burgos",   body: "Hassan really values the WY privacy posture. Pure passive holdco — minimal OA needed.",   createdAt: daysAgo(3) },
    { id: nextThreadEntryId(), caseId: c4.id, authorName: "Iris Burgos",   body: "PLLC requires ALL members hold active CA licenses. Confirmed both Sofia and her partner are current.", createdAt: daysAgo(15) },
    { id: nextThreadEntryId(), caseId: c5.id, authorName: "Iris Burgos",   body: "Series LLC is unusual — DE handles it cleanly but most other states don't honor the liability shield. Sticking with DE.", createdAt: daysAgo(14) },
    { id: nextThreadEntryId(), caseId: c7.id, authorName: "Devon Park",    body: "Critical priority — Marcus closes on FL property in 3 weeks. WY filing must move first.", createdAt: daysAgo(3) },
    { id: nextThreadEntryId(), caseId: c8.id, authorName: "Devon Park",    body: "Casa Verde is a 3-member structure. Reusing the Westbrook OA template — saves a day.",   createdAt: daysAgo(10) },
    { id: nextThreadEntryId(), caseId: c9.id, authorName: "Devon Park",    body: "Lucas wants NV specifically for the privacy. Walked him through the $425 + $200 license fee combo.", createdAt: daysAgo(7) },
    { id: nextThreadEntryId(), caseId: c10.id, authorName: "Devon Park",   body: "Buyout is structured per the original OA clause — no surprises. 24-month installment.",  createdAt: daysAgo(10) },
    { id: nextThreadEntryId(), caseId: c11.id, authorName: "Sara Mitchell",body: "EIN should land any day. Once it does, I'll finalize the multi-member OA and open the Chase account.", createdAt: daysAgo(3) },
    { id: nextThreadEntryId(), caseId: c12.id, authorName: "Sara Mitchell",body: "Tight timeline — Elliot needs Mercury account in ~10 days. Going with the $50 expedite, EIN same-day via IRS online.", createdAt: daysAgo(3) },
    { id: nextThreadEntryId(), caseId: c13.id, authorName: "Sara Mitchell",body: "Cloudpeak is series-fundable later — DE is the right call. Disregarded entity for now since it's single-member.", createdAt: daysAgo(8) },
    { id: nextThreadEntryId(), caseId: c14.id, authorName: "Sara Mitchell",body: "Sterling is heavy equipment — added a $50K consent threshold so neither member can unilaterally take on big capex.", createdAt: daysAgo(12) },
    { id: nextThreadEntryId(), caseId: c15.id, authorName: "Sara Mitchell",body: "Hannah qualifies for the AB-85 first-year franchise tax exemption. Calendared the second-year reminder.", createdAt: daysAgo(6) },
  );

  // ── Leads (pre-sale prospects) ──────────────────────────────────────────
  store.leads.push(
    {
      id: nextLeadId(),
      firstName: "Maya", lastName: "Chen",
      email: "maya@stealthstartup.io", phone: "+1 415 555 0301",
      companyName: "Maya Chen Ventures (tentative)", intendedState: "DE", intendedEntityType: "LLC",
      source: "website", status: "qualified",
      notes: "Solo founder, ex-Stripe. Wants DE for future fundraise. Ready to file once she finalizes the name.",
      ownerName: "Iris Burgos",
      estimatedValue: 1500,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(6), updatedAt: daysAgo(1),
    },
    {
      id: nextLeadId(),
      firstName: "Aiden", lastName: "Walsh",
      email: "aiden@walshconsulting.co", phone: "+1 617 555 0188",
      companyName: "Walsh Consulting LLC", intendedState: "MA", intendedEntityType: "LLC",
      source: "referral", status: "working",
      notes: "Referred by Robert Chen. Independent consultant. Needs basic MA LLC + EIN. Targeting end of month.",
      ownerName: "Iris Burgos",
      estimatedValue: 950,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(4), updatedAt: daysAgo(1),
    },
    {
      id: nextLeadId(),
      firstName: "Tasha", lastName: "Booker",
      email: "tasha@bookerbeauty.com", phone: "+1 404 555 0277",
      companyName: "Booker Beauty Collective", intendedState: "GA", intendedEntityType: "LLC",
      source: "event", status: "new",
      notes: "Met at Atlanta small-business expo. Wants to launch a 3-member beauty product LLC. Needs OA help.",
      ownerName: "Devon Park",
      estimatedValue: 1800,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(2), updatedAt: daysAgo(2),
    },
    {
      id: nextLeadId(),
      firstName: "Riley", lastName: "Tanner",
      email: "riley@tannerstudios.tv", phone: "+1 323 555 0144",
      companyName: "Tanner Studios LLC", intendedState: "CA", intendedEntityType: "LLC",
      source: "website", status: "working",
      notes: "Indie film production. Will need single-member CA LLC + handling of the $800 franchise tax.",
      ownerName: "Devon Park",
      estimatedValue: 1200,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(5), updatedAt: daysAgo(2),
    },
    {
      id: nextLeadId(),
      firstName: "Bao", lastName: "Nguyen",
      email: "bao@nguyenfoodtruck.com", phone: "+1 408 555 0166",
      companyName: null, intendedState: "CA", intendedEntityType: "LLC",
      source: "cold_call", status: "unqualified",
      notes: "Food truck operator. Cold called us looking for the cheapest option. Better fit for a self-service tool — not our ICP.",
      ownerName: "Sara Mitchell",
      estimatedValue: null,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(8), updatedAt: daysAgo(7),
    },
    {
      id: nextLeadId(),
      firstName: "Imani", lastName: "Okonkwo",
      email: "imani@horizonlabs.bio", phone: "+1 206 555 0233",
      companyName: "Horizon Biolabs LLC", intendedState: "DE", intendedEntityType: "LLC",
      source: "referral", status: "qualified",
      notes: "Biotech founder, pre-seed. Referred by Olivia Chen at Cloudpeak. Needs DE LLC + EIN + simple OA.",
      ownerName: "Sara Mitchell",
      estimatedValue: 1600,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(3), updatedAt: daysAgo(1),
    },
    {
      id: nextLeadId(),
      firstName: "Patrick", lastName: "O'Sullivan",
      email: "patrick@osullivanproperties.com", phone: "+1 312 555 0299",
      companyName: "O'Sullivan Properties", intendedState: "WY", intendedEntityType: "LLC (Holdco)",
      source: "partner", status: "new",
      notes: "Partner referral from a CPA firm. Wants a WY holdco for 4 Illinois rentals. Will likely become 4 foreign quals.",
      ownerName: "Devon Park",
      estimatedValue: 4200,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(1), updatedAt: daysAgo(1),
    },
    {
      id: nextLeadId(),
      firstName: "Joon", lastName: "Park",
      email: "joon@parkdental.com", phone: "+1 213 555 0322",
      companyName: "Park Family Dental PLLC", intendedState: "CA", intendedEntityType: "PLLC",
      source: "website", status: "new",
      notes: "Licensed CA dentist opening a private practice. PLLC required. Easy fit for our standard pro-services package.",
      ownerName: "Iris Burgos",
      estimatedValue: 1400,
      convertedAt: null, convertedAccountId: null, convertedContactId: null,
      createdAt: daysAgo(1), updatedAt: daysAgo(1),
    },
  );

  // ── Automations ─────────────────────────────────────────────────────────
  // One global automation, carrying the graph the standalone Automations page
  // used to show as its hardcoded demo. Seeding it global (rather than per
  // case) demonstrates the union model: it appears in every case, existing and
  // future, from a single row.
  store.automations.push({
    id: nextAutomationId(),
    name: "High-priority intake routing",
    scope: "global",
    caseId: null,
    graph: {
      nodes: [
        { id: "n1", type: "trigger", x: 80, y: 120, config: { event: "case.created" } },
        { id: "n2", type: "filter", x: 360, y: 120, config: { condition: "priority == 'high'" } },
        { id: "n3", type: "assign", x: 640, y: 60, config: { assignee: "team:litigation" } },
        { id: "n4", type: "notify", x: 640, y: 200, config: { channel: "slack", message: "High priority case opened" } },
        { id: "n5", type: "update", x: 920, y: 120, config: { field: "status", value: "review" } },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3" },
        { from: "n2", to: "n4" },
        { from: "n3", to: "n5" },
        { from: "n4", to: "n5" },
      ],
      viewport: null,
    },
    enabled: true,
    derivedFromAutomationId: null,
    originCaseId: null,
    ownerName: "Iris Burgos",
    createdAt: daysAgo(20),
    createdByName: "Iris Burgos",
    updatedAt: daysAgo(20),
    lastModifiedByName: "Iris Burgos",
  });

  store.meta.schemaVersion = CURRENT_SCHEMA_VERSION;
  persist();
}

// ── Team members (people who can be @-mentioned) ────────────────────────────
export const TEAM_MEMBERS = [
  "Iris Burgos",
  "Devon Park",
  "Sara Mitchell",
];

// Find an existing 1:1 DM containing exactly these two members, or create one.
export function findOrCreateDm(a: string, b: string): Conversation {
  const existing = store.conversations.find(
    (c) =>
      c.type === "dm" &&
      c.members.length === 2 &&
      c.members.includes(a) &&
      c.members.includes(b),
  );
  if (existing) return existing;
  const created: Conversation = {
    id: nextConversationId(),
    name: null,
    type: "dm",
    createdAt: new Date().toISOString(),
    members: [a, b],
  };
  store.conversations.push(created);
  return created;
}

// Parse @mentions out of a body string. Matches both first-name and full-name
// forms (case-insensitive). Excludes the author from the results.
export function parseMentions(body: string, author: string): string[] {
  const found = new Set<string>();
  for (const member of TEAM_MEMBERS) {
    if (member === author) continue;
    const forms = [member, member.split(" ")[0]];
    for (const form of forms) {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`@${escaped}(?![A-Za-z0-9])`, "i");
      if (re.test(body)) {
        found.add(member);
        break;
      }
    }
  }
  return Array.from(found);
}

// Build the case-number objects expected by the API for caseTags.
export function caseTagSummaries(caseIds: number[]) {
  return caseIds
    .map((id) => store.cases.find((c) => c.id === id))
    .filter((c): c is Case => !!c)
    .map((c) => ({ id: c.id, caseNumber: c.caseNumber }));
}
