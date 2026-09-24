import type { AccessContext } from "@cases/access";
import { useAuth } from "./auth";

/** Nobody: no permissions (used only while signed out). */
const NOBODY: AccessContext = { userId: -1, permissions: {}, supervisedUserIds: [] };

/**
 * The signed-in employee's access context, for the shared lib/access control
 * helpers (caseControls, leadControls, accountControls, …). The UI shows a
 * control only when the API would accept the action; the API still decides.
 */
export function useAccess(): AccessContext {
  return useAuth().access ?? NOBODY;
}
