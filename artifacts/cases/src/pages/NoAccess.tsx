import { Link } from "wouter";
import { ShieldOff, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Shown instead of a page the employee may not open (direct URL, old
 * bookmark). The page's own component never mounts, so it fetches nothing.
 */
export function NoAccess() {
  return (
    <div data-testid="no-access" className="min-h-[50vh] grid place-items-center text-center">
      <div className="space-y-4 max-w-sm">
        <ShieldOff size={40} className="mx-auto text-white/40" />
        <h1 className="text-2xl font-bold tracking-tight">You don't have access to this page</h1>
        <p className="text-sm text-white/50">
          Your role does not include this part of the CRM. If you need it, ask your supervisor.
        </p>
        <Link href="/">
          <a className="text-sm text-[var(--color-primary)] hover:underline">← Back to dashboard</a>
        </Link>
      </div>
    </div>
  );
}

/**
 * For employees whose roles grant nothing yet (Filing, Filing Supervisor,
 * Partner): no navigation at all, just this message and a way to sign out.
 */
export function NoRoleAccess() {
  const { user, logout } = useAuth();
  return (
    <div
      data-testid="no-role-access"
      className="min-h-screen w-full grid place-items-center px-4 bg-[var(--color-background)] text-white text-center"
    >
      <div className="space-y-4 max-w-sm">
        <ShieldOff size={40} className="mx-auto text-white/40" />
        <h1 className="text-2xl font-bold tracking-tight">No access has been set up for your role yet</h1>
        <p className="text-sm text-white/50">
          You're signed in as {user?.name}. Your administrator hasn't configured what your role can use.
        </p>
        <button
          onClick={() => void logout()}
          data-testid="sign-out"
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
