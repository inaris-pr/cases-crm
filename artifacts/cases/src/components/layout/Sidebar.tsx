import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Layers,
  Calculator,
  LineChart,
  Settings as SettingsIcon,
  Zap,
  Pin,
  PinOff,
  Activity,
  LogOut,
  UserCircle2,
  Sparkles,
  MessagesSquare,
  BookOpen,
} from "lucide-react";
import { visibleNavItems, type NavItem as AccessNavItem } from "@cases/access";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";
import { isRecordsLocation } from "@/lib/records";

interface NavItem {
  id: AccessNavItem["id"];
  label: string;
  href: string;
  external?: boolean;
  icon: typeof LayoutDashboard;
  /** Overrides prefix matching when a section spans several URL roots. */
  isActive?: (location: string) => boolean;
}

const ICONS: Record<AccessNavItem["id"], typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  leads: Sparkles,
  records: Layers,
  insights: LineChart,
  messages: MessagesSquare,
  knowledge: BookOpen,
  accounting: Calculator,
  settings: SettingsIcon,
};

/**
 * The sidebar for these permissions (RBAC Phase 5): built only from
 * lib/access's visibleNavItems, so anything the employee cannot use is
 * absent. Records links to the first tab they may open.
 */
function navFor(permissions: Parameters<typeof visibleNavItems>[0]): NavItem[] {
  return visibleNavItems(permissions).map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href ?? "/",
    external: item.external,
    icon: ICONS[item.id],
    // Records stays lit on its detail pages (/accounts/:id, /clients/:id, /cases/:id).
    isActive: item.id === "records" ? isRecordsLocation : undefined,
  }));
}

export function Sidebar() {
  const [location] = useLocation();
  const { permissions } = useAuth();
  const NAV = navFor(permissions);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;
  return (
    <motion.aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{ width: expanded ? 200 : 64 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="fixed top-4 bottom-4 left-4 z-40 glass-panel neon-border flex flex-col overflow-hidden"
    >
      {/* Logo + pin */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-white/5 shrink-0">
        <div className="size-8 grid place-items-center rounded-lg bg-[var(--color-primary)]/15">
          <Zap size={18} className="text-[var(--color-primary)] neon-text" />
        </div>
        <AnimatePresence>
          {expanded ? (
            <motion.span
              key="logo"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="text-[var(--color-primary)] font-black tracking-widest neon-text"
            >
              CASES.
            </motion.span>
          ) : null}
        </AnimatePresence>
        {expanded ? (
          <button
            onClick={() => setPinned((v) => !v)}
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
            className="ml-auto text-white/40 hover:text-white p-1 rounded-md hover:bg-white/5"
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive
            ? item.isActive(location)
            : !item.external &&
              (location === item.href ||
                (item.href !== "/" && location.startsWith(item.href)));
          const linkProps = item.external
            ? { href: item.href, target: "_blank", rel: "noopener noreferrer" }
            : {};
          const anchor = (
              <a
                {...linkProps}
                data-testid={`nav-${item.id}`}
                aria-label={item.label}
                className={cn(
                  "group relative flex items-center gap-3 h-10 px-3 rounded-lg text-sm transition-all",
                  isActive
                    ? "text-white bg-white/5"
                    : "text-white/55 hover:text-white hover:bg-white/5",
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--color-primary)]" />
                )}
                <Icon
                  size={18}
                  className={cn(
                    "shrink-0 transition-all",
                    isActive
                      ? "text-[var(--color-primary)] drop-shadow-[0_0_8px_rgba(41,243,18,0.6)]"
                      : "group-hover:text-white",
                  )}
                />
                <AnimatePresence>
                  {expanded ? (
                    <motion.span
                      key={item.label}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </a>
          );
          return item.external ? (
            <span key={item.id}>{anchor}</span>
          ) : (
            <Link key={item.id} href={item.href}>
              {anchor}
            </Link>
          );
        })}
      </nav>

      {/* System Health */}
      <div className="px-2 shrink-0">
        <SystemHealth expanded={expanded} />
      </div>

      {/* User pill + logout */}
      <div className="px-2 pt-1.5 pb-3 shrink-0">
        <UserChip expanded={expanded} />
      </div>
    </motion.aside>
  );
}

function UserChip({ expanded }: { expanded: boolean }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg glass-soft">
      {/* Personal settings live here, not in the sidebar (R3). */}
      <Link href="/account">
        <a data-testid="nav-account" title="Your account" aria-label="Your account" className="shrink-0">
          <Avatar name={user.name} size={28} />
        </a>
      </Link>
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="user-text"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="min-w-0 flex-1"
          >
            <div className="text-xs font-semibold text-white truncate">
              {user.name}
            </div>
            <div className="text-[10px] text-white/40 truncate">{user.email}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        onClick={() => void logout()}
        title="Sign out"
        data-testid="sign-out"
        className="size-7 grid place-items-center rounded-md text-white/50 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
      >
        <LogOut size={13} />
      </button>
    </div>
  );
}

function SystemHealth({ expanded }: { expanded: boolean }) {
  const score = 98;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg glass-soft">
      <div className="relative size-9 shrink-0">
        <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="3"
            fill="none"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            stroke="var(--color-primary)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 94.25} 94.25`}
            style={{ filter: "drop-shadow(0 0 4px rgba(41,243,18,0.7))" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-[10px] font-bold">
          {score}
        </div>
      </div>
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="health-text"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="min-w-0"
          >
            <div className="text-[10px] tracking-widest uppercase text-white/40 flex items-center gap-1">
              <Activity size={10} className="text-[var(--color-primary)]" />
              System health
            </div>
            <div className="text-xs text-white truncate">All systems normal</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
