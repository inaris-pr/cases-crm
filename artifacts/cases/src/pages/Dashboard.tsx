import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCw, Sparkles } from "lucide-react";
import { API, fetchJson, type DashboardData } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { WIDGETS, widgetAllowed, type DashboardWidget } from "@/components/dashboard/widgets";
import { Skeleton, WidgetError } from "@/components/dashboard/parts";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The personalized Dashboard (RBAC Phase 6).
 *
 * One layout for everyone, composed from the widget registry by the signed-in
 * employee's effective permissions (not by role name). The set of widgets is
 * fixed before anything is fetched, so nothing appears and then disappears.
 * All figures come from one request, GET /api/dashboard, which the server
 * computes over the records inside the employee's scope.
 *
 * States: while loading every widget shows a skeleton; if the request fails
 * every widget says so and offers a retry — a failure never shows as 0.
 */
export function Dashboard() {
  const { user, permissions } = useAuth();
  const widgets = WIDGETS.filter((w) => widgetAllowed(w, permissions));
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchJson<DashboardData>(API("/api/dashboard")),
    enabled: widgets.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const firstName = user?.name.split(" ")[0] ?? "there";
  const overdue = dashboard.data?.cases?.summary.overdueTasks;
  const retry = () => void dashboard.refetch();

  const stats = widgets.filter((w) => w.layout === "stats");
  const panels = widgets.filter((w) => w.layout !== "stats");

  return (
    <div className="space-y-5" data-testid="dashboard">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="text-xl font-bold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="text-xs text-white/50 mt-0.5">Here's what's new for you today.</p>
        </div>
        {overdue !== undefined && overdue > 0 && (
          <div
            data-testid="dashboard-overdue-pill"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[11px] font-semibold border border-[var(--color-primary)]/30 neon-border"
          >
            <Sparkles size={11} />
            {overdue} overdue task{overdue === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {dashboard.isError && (
        <div
          data-testid="dashboard-error"
          className="glass-panel p-3 flex items-center gap-3 text-sm border-amber-500/30"
        >
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <span className="flex-1">The dashboard couldn't be loaded. No figures are shown until it loads.</span>
          <button type="button" onClick={retry} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
            <RotateCw size={12} /> Retry
          </button>
        </div>
      )}

      {stats.map((w) => (
        <WidgetSlot key={w.id} widget={w} query={dashboard} onRetry={retry} ctx={{ permissions, userName: user?.name }} />
      ))}

      {panels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {panels.map((w) => (
            <div key={w.id} className={cn(w.layout === "wide" && "lg:col-span-2", "min-w-0")}>
              <WidgetSlot widget={w} query={dashboard} onRetry={retry} ctx={{ permissions, userName: user?.name }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetSlot({
  widget,
  query,
  onRetry,
  ctx,
}: {
  widget: DashboardWidget;
  query: { data?: DashboardData; isError: boolean };
  onRetry: () => void;
  ctx: Parameters<DashboardWidget["render"]>[1];
}) {
  // An error wins over older data: a failed refresh never leaves stale or zero figures looking current.
  const state = query.isError ? "error" : query.data ? "ready" : "loading";
  return (
    <section data-testid={`widget-${widget.id}`} data-state={state} aria-label={widget.title} className="h-full">
      {state === "ready" ? (
        widget.render(query.data!, ctx)
      ) : state === "error" ? (
        <WidgetError title={widget.title} onRetry={onRetry} />
      ) : (
        <Skeleton variant={widget.layout === "stats" ? "stats" : "panel"} />
      )}
    </section>
  );
}
