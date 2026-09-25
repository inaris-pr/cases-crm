import { Redirect, Route, Switch, useLocation } from "wouter";
import { canOpenRoute, visibleNavItems, visibleRecordsTabs } from "@cases/access";
import { AuthProvider, useAuth } from "./lib/auth";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { CaseDetail } from "./pages/CaseDetail";
import { AccountDetail } from "./pages/AccountDetail";
import { ContactDetail } from "./pages/ContactDetail";
import { Records } from "./pages/Records";
import { LEGACY_LIST_ROUTES, recordsPath } from "./lib/records";
import { Leads } from "./pages/Leads";
import { Accounting } from "./pages/Accounting";
import { Insights } from "./pages/Insights";
import { Settings } from "./pages/Settings";
import { Messages } from "./pages/Messages";
import { Knowledge } from "./pages/Knowledge";
import { KnowledgeArticle } from "./pages/KnowledgeArticle";
import { NotFound } from "./pages/NotFound";
import { LoginPage } from "./pages/Login";
import { NoAccess, NoRoleAccess } from "./pages/NoAccess";
import { AccountSettings } from "./pages/AccountSettings";
import { isRecordsTab } from "./lib/records";

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { user, loading, permissions } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen w-full grid place-items-center text-white/40 text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return <LoginPage />;
  // Permissions arrive with the user (lib/session.ts sets them first), so
  // nothing below renders with another employee's navigation.
  // Roles that grant nothing (Filing, Partner, …) get no application at all.
  if (visibleNavItems(permissions).length === 0) return <NoRoleAccess />;
  return (
    <AppLayout>
      <GuardedRoutes />
    </AppLayout>
  );
}

/**
 * The route guard (RBAC Phase 5): a page the employee may not open is replaced
 * by the No Access screen BEFORE its component mounts, so it fetches nothing.
 * Rules: ROUTE_ACCESS in lib/access. The API enforces the same rules.
 */
function GuardedRoutes() {
  const [location] = useLocation();
  const { permissions } = useAuth();
  if (!canOpenRoute(permissions, location)) return <NoAccess />;
  const firstTab = visibleRecordsTabs(permissions).find(isRecordsTab);
  return (
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        {/* Records: Accounts, Clients and Cases as tabs of one workspace. */}
        <Route path="/records">
          {/* The first Records tab this employee may open. */}
          {firstTab ? <Redirect to={recordsPath(firstTab)} replace /> : <NoAccess />}
        </Route>
        <Route path="/records/:tab" component={Records} />
        {/* The old list URLs now open the matching Records tab, so bookmarks
            keep working. replace avoids leaving a dead entry in history. */}
        {LEGACY_LIST_ROUTES.map(([from, tab]) => (
          <Route key={from} path={from}>
            <Redirect to={recordsPath(tab)} replace />
          </Route>
        ))}
        {/* Individual record pages are unchanged. */}
        <Route path="/accounts/:id" component={AccountDetail} />
        <Route path="/clients/:id" component={ContactDetail} />
        <Route path="/contacts/:id" component={ContactDetail} />
        <Route path="/cases/:id" component={CaseDetail} />
        <Route path="/accounting" component={Accounting} />
        {/* Automations live inside a case (Case > Automations). The old
            standalone workspace is gone; keep the route so existing links
            land somewhere useful instead of on Not found. */}
        <Route path="/workflow">
          <Redirect to={recordsPath("cases")} replace />
        </Route>
        <Route path="/insights" component={Insights} />
        <Route path="/settings" component={Settings} />
        <Route path="/messages" component={Messages} />
        {/* Knowledge Base (Phase 8B): read-only reference articles. */}
        <Route path="/knowledge" component={Knowledge} />
        <Route path="/knowledge/:slug" component={KnowledgeArticle} />
        <Route path="/account" component={AccountSettings} />
        <Route component={NotFound} />
      </Switch>
  );
}
