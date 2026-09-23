import { Link, Redirect, useParams } from "wouter";
import { Building2, Users, FolderKanban } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  RECORDS_TABS,
  RECORDS_TAB_LABELS,
  isRecordsTab,
  recordsPath,
  type RecordsTab,
} from "@/lib/records";
import { Accounts } from "./Accounts";
import { Clients } from "./Clients";
import { CasesList } from "./CasesList";

const TAB_ICONS: Record<RecordsTab, typeof Building2> = {
  accounts: Building2,
  clients: Users,
  cases: FolderKanban,
};

/**
 * Accounts, Clients and Cases under one sidebar entry.
 *
 * This page is only a tab strip. Each tab renders the existing page component
 * unchanged — its own header, search, filters, views, create actions and data
 * fetching — so nothing is duplicated and nothing is redesigned.
 *
 * Only the active tab is mounted, which is exactly how these pages behaved as
 * separate sidebar sections: moving away from one and back starts it fresh.
 * The tab itself is in the URL (/records/:tab), so a refresh or a bookmark
 * lands on the same tab.
 */
export function Records() {
  const { tab } = useParams<{ tab?: string }>();

  if (!isRecordsTab(tab)) return <Redirect to={recordsPath()} replace />;

  return (
    <div className="space-y-4">
      <nav
        aria-label="Records"
        className="flex items-center gap-1 border-b border-white/5 overflow-x-auto"
      >
        {RECORDS_TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          const active = t === tab;
          return (
            <Link
              key={t}
              href={recordsPath(t)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "px-3 py-2.5 text-xs -mb-px border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap uppercase tracking-widest",
                active
                  ? "border-[var(--color-primary)] text-[var(--color-primary)] font-semibold"
                  : "border-transparent text-white/45 hover:text-white",
              )}
            >
              <Icon size={11} />
              {RECORDS_TAB_LABELS[t]}
            </Link>
          );
        })}
      </nav>

      {tab === "accounts" && <Accounts />}
      {tab === "clients" && <Clients />}
      {tab === "cases" && <CasesList />}
    </div>
  );
}
