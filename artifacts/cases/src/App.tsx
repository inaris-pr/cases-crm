import { Redirect, Route, Switch } from "wouter";
import { AuthProvider, useAuth } from "./lib/auth";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { CasesList } from "./pages/CasesList";
import { CaseDetail } from "./pages/CaseDetail";
import { Accounts } from "./pages/Accounts";
import { AccountDetail } from "./pages/AccountDetail";
import { Clients } from "./pages/Clients";
import { ContactDetail } from "./pages/ContactDetail";
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
        <Route path="/accounts" component={Accounts} />
        <Route path="/accounts/:id" component={AccountDetail} />
        <Route path="/clients" component={Clients} />
        <Route path="/clients/:id" component={ContactDetail} />
        {/* Legacy aliases — keep old links working */}
        <Route path="/customers" component={Clients} />
        <Route path="/contacts" component={Clients} />
        <Route path="/contacts/:id" component={ContactDetail} />
        <Route path="/cases" component={CasesList} />
        <Route path="/cases/:id" component={CaseDetail} />
        <Route path="/accounting" component={Accounting} />
        {/* Automations live inside a case (Case > Automations). The old
            standalone workspace is gone; keep the route so existing links
            land somewhere useful instead of on Not found. */}
        <Route path="/workflow">
          <Redirect to="/cases" />
        </Route>
        <Route path="/insights" component={Insights} />
        <Route path="/settings" component={Settings} />
        <Route path="/messages" component={Messages} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}
