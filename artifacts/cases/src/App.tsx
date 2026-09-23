import { Redirect, Route, Switch } from "wouter";
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
import { NotFound } from "./pages/NotFound";
import { LoginPage } from "./pages/Login";

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen w-full grid place-items-center text-white/40 text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        {/* Records: Accounts, Clients and Cases as tabs of one workspace. */}
        <Route path="/records">
          <Redirect to={recordsPath()} replace />
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
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}
