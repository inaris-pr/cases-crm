import { User, Bell, Shield, Key } from "lucide-react";
import { visiblePersonalSections } from "@cases/access";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";

const ICONS: Record<string, typeof User> = { profile: User, notifications: Bell, security: Shield, api_keys: Key };
const DESCRIPTIONS: Record<string, string> = {
  profile: "Manage your personal information and avatar.",
  notifications: "Configure email, push, and in-app alerts.",
  security: "Update your password and enable 2FA.",
  api_keys: "Manage developer access tokens.",
};

/**
 * Personal settings (prototype cards), reached from the account chip in the
 * sidebar — every employee has these. API Keys is an integration secret and
 * appears only with system.integrations.manage (System Owner).
 */
export function AccountSettings() {
  const { user, permissions } = useAuth();
  const sections = visiblePersonalSections(permissions);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {user && <Avatar name={user.name} size={40} />}
        <div>
          <div className="label-eyebrow mb-1">Your account</div>
          <h1 className="text-xl font-bold tracking-tight">{user?.name}</h1>
          <div className="text-xs text-white/50">{user?.email}</div>
        </div>
      </div>
      <section>
        <div className="label-eyebrow mb-3">Personal</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sections.map((s) => {
            const Icon = ICONS[s.id] ?? User;
            return (
              <button
                key={s.id}
                data-testid={`personal-${s.id}`}
                className="glass-panel p-4 text-left group hover:border-[var(--color-primary)]/30 transition-all hover:-translate-y-0.5"
              >
                <div className="size-10 rounded-lg grid place-items-center bg-[var(--color-primary)]/10 text-[var(--color-primary)] mb-3">
                  <Icon size={18} />
                </div>
                <div className="font-semibold">{s.label}</div>
                <div className="text-xs text-white/50 mt-1">{DESCRIPTIONS[s.id]}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
