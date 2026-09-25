import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, Phone, UserRound, Link2 } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type {
  AccountWithCounts,
  Case,
  CaseCategory,
  CasePriority,
  CaseStatus,
  ContactDetail,
  ContactWithSummary,
  CustomerWithCounts,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { CASE_CATEGORY_OPTIONS } from "@/lib/caseMeta";

/**
 * Where the drawer was opened from. It decides what is locked and what the
 * employee still has to choose; the form fields and the submit path are the
 * same in every case.
 *
 *   global  — the Cases section. Pick the account; the contact is optional.
 *   account — an Account page. The account is fixed; pick one of its contacts.
 *   client  — a Client page. The client is fixed; pick one of *their* accounts.
 */
export type NewCaseContext =
  | { kind: "global" }
  | { kind: "account"; accountId: number; accountName: string }
  | { kind: "client"; contactId: number; contactName: string };

const GLOBAL: NewCaseContext = { kind: "global" };

interface FormState {
  title: string;
  accountId: number;
  primaryContactId: number;
  status: CaseStatus;
  priority: CasePriority;
  /** Phase 7: optional primary category ("" = uncategorized). */
  category: CaseCategory | "";
  description: string;
  tags: string;
}

const emptyForm = (status: CaseStatus): FormState => ({
  title: "",
  accountId: 0,
  primaryContactId: 0,
  status,
  priority: "medium",
  category: "",
  description: "",
  tags: "",
});

/**
 * The one New Case form. The Cases section, Account pages and Client pages all
 * open this component; only the context differs.
 *
 * Email and phone are never stored on the case. The Case record holds
 * accountId and primaryContactId, and the contact's details are read through
 * that relationship — so they are shown here read-only, for confirmation.
 */
export function NewCaseDrawer({
  open,
  onClose,
  initialStatus,
  context = GLOBAL,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialStatus?: CaseStatus;
  context?: NewCaseContext;
  onCreated?: (created: Case) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => emptyForm(initialStatus ?? "intake"));

  // ── Sources ──────────────────────────────────────────────────────────────
  // Global mode keeps the list the form has always used.
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchJson<CustomerWithCounts[]>(API("/api/customers")),
    enabled: open && context.kind === "global",
  });

  // Client mode: the client, and the accounts they are linked to.
  const client = useQuery({
    queryKey: ["contact", context.kind === "client" ? context.contactId : 0],
    queryFn: () =>
      fetchJson<ContactDetail>(
        API(`/api/contacts/${context.kind === "client" ? context.contactId : 0}`),
      ),
    enabled: open && context.kind === "client",
  });

  const accountId =
    context.kind === "account" ? context.accountId : form.accountId;

  // Contacts linked to the chosen account (account and global modes).
  const accountContacts = useQuery({
    queryKey: ["contacts", { accountId }],
    queryFn: () =>
      fetchJson<ContactWithSummary[]>(API(`/api/contacts?accountId=${accountId}`)),
    enabled: open && context.kind !== "client" && accountId > 0,
  });

  // Client mode's account choices: every account this client is linked to.
  const clientAccounts = client.data?.accounts ?? [];

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(initialStatus ?? "intake"));
  }, [open, initialStatus, context.kind]);

  // A client with exactly one account gets it preselected — but still shown.
  useEffect(() => {
    if (!open || context.kind !== "client") return;
    if (form.accountId === 0 && clientAccounts.length === 1) {
      setForm((f) => ({ ...f, accountId: clientAccounts[0].id }));
    }
  }, [open, context.kind, clientAccounts, form.accountId]);

  // An account with exactly one contact gets that contact preselected.
  const contactOptions = accountContacts.data ?? [];
  useEffect(() => {
    if (!open || context.kind === "client") return;
    if (form.primaryContactId === 0 && contactOptions.length === 1) {
      setForm((f) => ({ ...f, primaryContactId: contactOptions[0].id }));
    }
  }, [open, context.kind, contactOptions, form.primaryContactId]);

  function chooseAccount(id: number) {
    // The contact belongs to the previous account; clear it so an invalid
    // account/contact combination can never be submitted.
    setForm((f) => ({ ...f, accountId: id, primaryContactId: 0 }));
  }

  // ── The contact whose details are shown for confirmation ─────────────────
  const shownContact = useMemo(() => {
    if (context.kind === "client") {
      const c = client.data;
      return c ? { name: c.fullName, email: c.email, phone: c.phone, title: c.title } : null;
    }
    const c = contactOptions.find((x) => x.id === form.primaryContactId);
    return c ? { name: c.fullName, email: c.email, phone: c.phone, title: c.title } : null;
  }, [context.kind, client.data, contactOptions, form.primaryContactId]);

  const shownAccountName =
    context.kind === "account"
      ? context.accountName
      : context.kind === "client"
        ? clientAccounts.find((a) => a.id === form.accountId)?.name ?? null
        : null;

  // ── Submit ───────────────────────────────────────────────────────────────
  const primaryContactId =
    context.kind === "client" ? context.contactId : form.primaryContactId;

  const create = useMutation({
    mutationFn: () =>
      fetchJson<Case>(API("/api/cases"), {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          accountId,
          ...(primaryContactId > 0 ? { primaryContactId } : {}),
          status: form.status,
          priority: form.priority,
          ...(form.category ? { category: form.category } : {}),
          description: form.description,
          tags: form.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      // The account's Cases tab and the client's cases list both read these.
      qc.invalidateQueries({ queryKey: ["account", created.accountId] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      if (created.primaryContactId) {
        qc.invalidateQueries({ queryKey: ["contact", created.primaryContactId] });
      }
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setForm(emptyForm(initialStatus ?? "intake"));
      onCreated?.(created);
      onClose();
    },
  });

  const clientHasNoAccounts =
    context.kind === "client" && client.isSuccess && clientAccounts.length === 0;

  const canSubmit =
    form.title.trim().length > 0 && accountId > 0 && !create.isPending && !clientHasNoAccounts;

  const description =
    context.kind === "account"
      ? `Open a new matter for ${context.accountName}.`
      : context.kind === "client"
        ? `Open a new matter for ${context.contactName}.`
        : "Open a new matter and assign it to a customer.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New case"
      description={description}
      drawer
      widthClass="max-w-md"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <Label>Title</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Series C term sheet review"
            required
          />
        </div>

        {/* ── Who and which company ─────────────────────────────────────── */}
        {context.kind === "global" && (
          <div>
            <Label>Customer</Label>
            <Select
              value={form.accountId || ""}
              onChange={(e) => chooseAccount(Number(e.target.value))}
              required
            >
              <option value="" disabled>
                Select a customer…
              </option>
              {(customers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company ? `· ${c.company}` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}

        {context.kind === "account" && (
          <LockedField icon={Building2} label="Account" value={context.accountName} />
        )}

        {context.kind === "client" && (
          <>
            <LockedField icon={UserRound} label="Client" value={context.contactName} />
            {client.isLoading ? (
              <div className="text-xs text-white/40">Loading linked accounts…</div>
            ) : clientHasNoAccounts ? (
              <NoLinkedAccounts contactId={context.contactId} contactName={context.contactName} />
            ) : (
              <div>
                <Label>Account — which company is this case about?</Label>
                <Select
                  value={form.accountId || ""}
                  onChange={(e) => chooseAccount(Number(e.target.value))}
                  required
                >
                  <option value="" disabled>
                    Select one of {context.contactName}'s accounts…
                  </option>
                  {clientAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.link?.role ? ` · ${a.link.role}` : ""}
                    </option>
                  ))}
                </Select>
                {shownAccountName && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-primary)]">
                    <Building2 size={11} />
                    This case will be filed under <span className="font-semibold">{shownAccountName}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {context.kind !== "client" && accountId > 0 && (
          <div>
            <Label>Contact</Label>
            {accountContacts.isLoading ? (
              <div className="text-xs text-white/40">Loading contacts…</div>
            ) : contactOptions.length === 0 ? (
              <div className="text-xs text-white/45">
                No contacts are linked to this account. The case will be created without a
                primary contact.
              </div>
            ) : (
              <Select
                value={form.primaryContactId || ""}
                onChange={(e) =>
                  setForm({ ...form, primaryContactId: Number(e.target.value) })
                }
              >
                {contactOptions.length > 1 && <option value="">No primary contact</option>}
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.title ? ` · ${c.title}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        {shownContact && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 space-y-1">
            <div className="label-eyebrow">Contact details (from the client record)</div>
            <div className="text-[13px] text-white font-medium">
              {shownContact.name}
              {shownContact.title && (
                <span className="text-white/45 font-normal"> · {shownContact.title}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-white/65">
              <Mail size={12} className="text-white/40" />
              {shownContact.email ?? <span className="text-white/35">No email on file</span>}
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-white/65">
              <Phone size={12} className="text-white/40" />
              {shownContact.phone ?? <span className="text-white/35">No phone on file</span>}
            </div>
          </div>
        )}

        {/* ── Case fields, unchanged ────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CaseStatus })}
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
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as CasePriority })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Category (optional)</Label>
          <Select
            data-testid="new-case-category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as CaseCategory | "" })}
          >
            <option value="">Uncategorized</option>
            {CASE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Summarize the matter…"
          />
        </div>
        <div>
          <Label>Tags (comma separated)</Label>
          <Input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="financing, term-sheet"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {create.isPending ? "Creating…" : "Create case"}
          </Button>
        </div>
        {create.error && (
          <p className="text-xs text-red-400">{String(create.error.message ?? create.error)}</p>
        )}
      </form>
    </Modal>
  );
}

function LockedField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-md border border-white/10 bg-white/[0.03] text-[13px] text-white">
        <Icon size={13} className="text-[var(--color-primary)]" />
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

/**
 * A client with no linked account cannot have a case — every case belongs to
 * an account. Offer to link one here, reusing POST /api/account-contacts, so
 * the employee does not have to leave the form. Nothing about the account or
 * the client is edited; only a link record is added.
 */
function NoLinkedAccounts({ contactId, contactName }: { contactId: number; contactName: string }) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState(0);
  const [role, setRole] = useState("");

  const accounts = useQuery({
    queryKey: ["accounts", { all: true }],
    queryFn: () => fetchJson<AccountWithCounts[]>(API("/api/accounts")),
  });

  const link = useMutation({
    mutationFn: () =>
      fetchJson(API("/api/account-contacts"), {
        method: "POST",
        body: JSON.stringify({ accountId, contactId, role: role.trim() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["account", accountId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-3 space-y-3">
      <div className="text-[12px] leading-relaxed">
        <span className="font-semibold text-amber-200">
          {contactName} is not linked to any account.
        </span>{" "}
        <span className="text-white/60">
          Every case belongs to an account, so link {contactName} to one first. This adds a
          link only — it does not change the account or the client.
        </span>
      </div>
      <div>
        <Label>Account</Label>
        <Select value={accountId || ""} onChange={(e) => setAccountId(Number(e.target.value))}>
          <option value="" disabled>
            Select an account…
          </option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Role on that account</Label>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Founder, Manager, Member"
        />
      </div>
      {link.error && (
        <p className="text-xs text-red-400">{String(link.error.message ?? link.error)}</p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => link.mutate()}
          disabled={accountId === 0 || role.trim().length === 0 || link.isPending}
        >
          <Link2 size={13} />
          {link.isPending ? "Linking…" : "Link to this account"}
        </Button>
      </div>
    </div>
  );
}
