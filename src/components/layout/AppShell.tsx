import Link from "next/link";
import { signOut } from "@/auth";
import { countUnread } from "@/lib/data/notifications";
import { getProfileById } from "@/lib/data/profiles";
import { Avatar } from "@/components/settings/Avatar";

const NAV_ITEMS = [
  { href: "/", label: "Priority", icon: "🎯", enabled: true },
  { href: "/calendar", label: "Calendar", icon: "📅", enabled: false },
  { href: "/matrix", label: "Priority Matrix", icon: "📊", enabled: true },
  { href: "/boards", label: "Boards", icon: "🗂️", enabled: true },
  { href: "/feed", label: "Friend Feed", icon: "👥", enabled: true },
];

export async function AppShell({
  children,
  userLabel,
  profileId,
}: {
  children: React.ReactNode;
  userLabel: string;
  /** Optional: when given, shows an unread-notifications badge. */
  profileId?: string;
}) {
  const [unreadCount, profile] = await Promise.all([
    profileId ? countUnread(profileId) : Promise.resolve(0),
    profileId ? getProfileById(profileId) : Promise.resolve(null),
  ]);
  const isAdventure = profile?.theme === "adventure";

  return (
    <div
      data-theme={profile?.theme ?? "calm"}
      className={`flex min-h-screen ${isAdventure ? "bg-gradient-to-br from-amber-50 to-rose-50 dark:from-zinc-950 dark:to-red-950" : "bg-zinc-50 dark:bg-black"}`}
    >
      <aside
        className={`flex w-16 flex-col items-center gap-2 border-r py-4 sm:w-48 sm:items-stretch sm:px-3 ${
          isAdventure ? "border-amber-200 dark:border-red-950" : "border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <div className="mb-4 hidden px-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50 sm:block">
          {isAdventure ? "⚔️ Goal Dashboard" : "Goal Dashboard"}
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <span aria-hidden>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ) : (
              <span
                key={item.href}
                title="Coming soon"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 dark:text-zinc-600"
              >
                <span aria-hidden>{item.icon}</span>
                <span className="hidden sm:inline">
                  {item.label} <span className="text-xs">(soon)</span>
                </span>
              </span>
            )
          )}
          {profileId && (
            <Link
              href="/notifications"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span aria-hidden className="relative">
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline">Notifications</span>
            </Link>
          )}
          {profileId && (
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span aria-hidden>⚙️</span>
              <span className="hidden sm:inline">Settings</span>
            </Link>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-1 pt-4">
          <div className="flex items-center gap-2">
            {profile && <Avatar profile={profile} size={7} />}
            <span className="hidden truncate text-xs text-zinc-500 sm:block">
              {userLabel}
            </span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-8">{children}</main>
    </div>
  );
}
