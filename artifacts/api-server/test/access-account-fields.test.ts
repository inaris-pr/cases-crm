import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_FIELDS,
  ACCOUNT_FIELD_GROUPS,
  ACCOUNT_READ_RULES,
  accountFieldGroup,
  accountFieldWritePermissions,
  forbiddenAccountFields,
  maskEin,
  maskLast4,
  redactAccount,
  resolvePermissions,
  type RoleKey,
} from "../src/access";

/** Account field groups, sensitive-read rules and write rules (§R2). */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Field names declared in the Account interface in src/store.ts. */
function accountInterfaceFields(): string[] {
  const src = fs.readFileSync(path.join(HERE, "../src/store.ts"), "utf-8");
  const body = src.match(/export interface Account \{([\s\S]*?)\n\}/);
  if (!body) throw new Error("Account interface not found in store.ts");
  return [...body[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]);
}

const SAMPLE = {
  id: 7,
  name: "Acme LLC",
  ein: "12-3456789",
  fincenId: "FINCEN-123456789",
  fincenFilingDate: "2026-01-02",
  stripeId: "cus_ABC123",
  oldStripeIds: "cus_OLD1,cus_OLD2",
  bankingAppId: "BA-99887766",
  bankingAppStatus: "APPROVED",
  bankingAppMessage: "Approved with limits",
  firstTransactionDate: "2026-02-03",
  abandonedCartUrl: "https://example.com/cart/abc",
  companyPhone: "555-0100",
};

const as = (...roles: RoleKey[]) => resolvePermissions(roles);

describe("Account field groups", () => {
  it("place every field of the Account record in exactly one group", () => {
    const declared = accountInterfaceFields();
    expect(declared.length).toBeGreaterThan(40);
    expect([...declared].sort()).toEqual([...ACCOUNT_FIELDS].sort());
    expect(new Set(ACCOUNT_FIELDS).size).toBe(ACCOUNT_FIELDS.length);
  });

  it("use the approved groups", () => {
    expect(Object.keys(ACCOUNT_FIELD_GROUPS).sort()).toEqual(
      ["base", "financial", "formation", "profile", "regulatory_ids", "service", "system"].sort(),
    );
    expect(accountFieldGroup("ein")).toBe("regulatory_ids");
    expect(accountFieldGroup("fincenId")).toBe("regulatory_ids");
    expect(accountFieldGroup("stripeId")).toBe("financial");
    expect(accountFieldGroup("bankingAppStatus")).toBe("financial");
    expect(accountFieldGroup("brand")).toBe("service");
    expect(accountFieldGroup("name")).toBe("formation");
    expect(accountFieldGroup("website")).toBe("profile");
    expect(accountFieldGroup("portalId")).toBe("system");
    expect(accountFieldGroup("ownerName")).toBe("base");
    expect(accountFieldGroup("nope")).toBeNull();
  });

  it("only name sensitive-read rules for real regulatory or financial fields", () => {
    for (const f of Object.keys(ACCOUNT_READ_RULES)) {
      expect(["regulatory_ids", "financial"]).toContain(accountFieldGroup(f));
    }
  });
});

describe("masking", () => {
  it("masks EINs and identifiers to the last four", () => {
    expect(maskEin("12-3456789")).toBe("**-***6789");
    expect(maskEin("123")).toBe("**-*******");
    expect(maskLast4("FINCEN-123456789")).toBe("****6789");
    expect(maskLast4("abcd")).toBe("****");
  });
});

describe("redactAccount by role", () => {
  for (const role of ["csr", "csr_supervisor", "business_advisor", "business_advisor_supervisor"] as RoleKey[]) {
    it(`${role}: masked regulatory IDs, no financial identifiers`, () => {
      const { account, redactedFields } = redactAccount(SAMPLE, as(role));
      expect(account.ein).toBe("**-***6789");
      expect(account.fincenId).toBe("****6789");
      expect(account.stripeId).toBeNull();
      expect(account.oldStripeIds).toBeNull();
      expect(account.bankingAppId).toBeNull();
      expect(account.bankingAppMessage).toBeNull();
      expect(account.abandonedCartUrl).toBeNull();
      // Dates and the banking status stay visible.
      expect(account.fincenFilingDate).toBe("2026-01-02");
      expect(account.bankingAppStatus).toBe("APPROVED");
      expect(account.firstTransactionDate).toBe("2026-02-03");
      expect(account.companyPhone).toBe("555-0100");
      expect([...redactedFields].sort()).toEqual(
        ["abandonedCartUrl", "bankingAppId", "bankingAppMessage", "ein", "fincenId", "oldStripeIds", "stripeId"],
      );
    });
  }

  for (const role of ["operations_admin", "operations_admin_supervisor"] as RoleKey[]) {
    it(`${role}: full regulatory IDs, no financial identifiers`, () => {
      const { account, redactedFields } = redactAccount(SAMPLE, as(role));
      expect(account.ein).toBe("12-3456789");
      expect(account.fincenId).toBe("FINCEN-123456789");
      expect(account.stripeId).toBeNull();
      expect(account.bankingAppId).toBeNull();
      expect([...redactedFields].sort()).toEqual(
        ["abandonedCartUrl", "bankingAppId", "bankingAppMessage", "oldStripeIds", "stripeId"],
      );
    });
  }

  it("system_owner: everything in full", () => {
    const { account, redactedFields } = redactAccount(SAMPLE, as("system_owner"));
    expect(account).toEqual(SAMPLE);
    expect(redactedFields).toEqual([]);
  });

  it("leaves null values null and does not mutate the input", () => {
    const input = { ...SAMPLE, ein: null, fincenId: "" };
    const { account } = redactAccount(input, as("csr"));
    expect(account.ein).toBeNull();
    expect(account.fincenId).toBe("");
    expect(input.stripeId).toBe("cus_ABC123");
  });
});

describe("account write rules", () => {
  it("map each field to the permission(s) needed to write it", () => {
    expect(accountFieldWritePermissions("website")).toEqual(["accounts.edit.profile"]);
    expect(accountFieldWritePermissions("brand")).toEqual(["accounts.edit.service"]);
    expect(accountFieldWritePermissions("name")).toEqual(["accounts.edit.formation"]);
    expect(accountFieldWritePermissions("ein")).toEqual(["accounts.edit.regulatory_ids", "accounts.view.regulatory_ids"]);
    expect(accountFieldWritePermissions("stripeId")).toEqual(["accounts.edit.financial", "accounts.view.financial"]);
    expect(accountFieldWritePermissions("portalId")).toEqual(["accounts.edit.system"]);
    expect(accountFieldWritePermissions("ownerName")).toEqual(["accounts.assign"]);
    expect(accountFieldWritePermissions("archived")).toEqual(["accounts.archive"]);
    for (const f of ["id", "createdAt", "createdByName", "lastModifiedAt", "lastModifiedByName"]) {
      expect(accountFieldWritePermissions(f)).toBeNull();
    }
    expect(accountFieldWritePermissions("madeUp")).toBeNull();
  });

  const PROBE = ["website", "brand", "name", "ein", "stripeId", "portalId", "ownerName", "archived", "id"];

  const CASES: [RoleKey, string[]][] = [
    ["csr", ["brand", "name", "ein", "stripeId", "portalId", "ownerName", "archived", "id"]],
    ["csr_supervisor", ["brand", "name", "ein", "stripeId", "portalId", "ownerName", "archived", "id"]],
    ["business_advisor", ["name", "ein", "stripeId", "portalId", "ownerName", "archived", "id"]],
    ["business_advisor_supervisor", ["name", "ein", "stripeId", "portalId", "archived", "id"]],
    ["operations_admin", ["brand", "ein", "stripeId", "portalId", "ownerName", "archived", "id"]],
    ["operations_admin_supervisor", ["stripeId", "portalId", "id"]],
    ["hr", ["website", "brand", "name", "ein", "stripeId", "portalId", "ownerName", "archived", "id"]],
    ["system_owner", ["id"]],
  ];
  for (const [role, forbidden] of CASES) {
    it(`${role}: forbidden fields`, () => {
      expect(forbiddenAccountFields(PROBE, as(role))).toEqual(forbidden);
    });
  }
});
