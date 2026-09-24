/**
 * What happens to the browser when a session starts, resumes or ends.
 *
 * Rules:
 * - After every successful sign-in the employee lands on the Dashboard
 *   (`POST_LOGIN_PATH`), whoever signed in before and whatever page was
 *   open. A page visited in one session never decides where the next
 *   session starts.
 * - Signing out (or losing the session to a 401) forgets the employee,
 *   clears every cached query and leaves the protected URL, so the login
 *   screen is shown at `/` and no destination is carried over.
 * - Reloading the page while signed in resumes the session where it is:
 *   only an actual sign-in moves the employee to the Dashboard.
 *
 * Pure logic with no imports (the API test suite runs it under Node); the
 * React side is lib/auth.tsx, which supplies the effects.
 */

/** The first page after every successful sign-in: the Dashboard. */
export const POST_LOGIN_PATH = "/";

/** Where the browser goes when a session ends. The login screen renders there. */
export const SIGNED_OUT_PATH = "/";

export interface SessionEffects<U, P> {
  /** Drop every cached query (another employee's data must never show). */
  clearCache(): void;
  setUser(user: U | null): void;
  setPermissions(permissions: P): void;
  /** Replace the current history entry with `path`. */
  replaceLocation(path: string): void;
}

/**
 * A successful sign-in. Order matters: the cache is cleared and the URL is
 * moved to the Dashboard before the user is set, so the first authenticated
 * render is the Dashboard with no data from a previous session.
 */
export function beginSession<U, P>(fx: SessionEffects<U, P>, user: U, permissions: P): void {
  fx.clearCache();
  fx.replaceLocation(POST_LOGIN_PATH);
  fx.setPermissions(permissions);
  fx.setUser(user);
}

/**
 * The page was (re)loaded and the server says a session already exists.
 * The current URL is kept — a refresh is not a sign-in.
 */
export function resumeSession<U, P>(fx: SessionEffects<U, P>, user: U, permissions: P): void {
  fx.setPermissions(permissions);
  fx.setUser(user);
}

/** Sign-out, or the server reported the session gone (401). */
export function endSession<U, P>(fx: SessionEffects<U, P>, noPermissions: P): void {
  fx.setUser(null);
  fx.setPermissions(noPermissions);
  fx.clearCache();
  fx.replaceLocation(SIGNED_OUT_PATH);
}
