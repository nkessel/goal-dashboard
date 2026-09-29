import Link from "next/link";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/settings/Avatar";
import { getProfileById } from "@/lib/data/profiles";
import { notFound } from "next/navigation";

export default async function SettingsPage() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();
  const adventure = profile.theme === "adventure";

  const items: { href: string; label: string; detail: string; art: React.ReactNode }[] = [
    {
      href: "/settings/theme",
      label: "Theme",
      detail: adventure ? "Adventure" : "Calm",
      art: <Art adventure={adventure} src="/adventure/ui-shield.png" emoji="🎨" />,
    },
    {
      href: "/settings/avatar",
      label: "Avatar",
      detail: "Your character on the feed and in comments",
      art: <Avatar profile={profile} size={9} />,
    },
    {
      href: "/settings/celebration",
      label: "Celebration effects",
      detail: "Dust, sparks and embers when you finish a quest",
      art: <Art adventure={adventure} src="/adventure/ui-flame.png" emoji="✨" />,
    },
  ];

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.href}>
              <Link
                href={it.href}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center">{it.art}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{it.label}</span>
                  <span className="truncate text-sm text-zinc-500">{it.detail}</span>
                </span>
                <span aria-hidden className="text-xl text-zinc-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500">Signed in as {profile.email}</p>
      </div>
    </AppShell>
  );
}

function Art({ adventure, src, emoji }: { adventure: boolean; src: string; emoji: string }) {
  if (!adventure) return <span className="text-2xl" aria-hidden>{emoji}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-9 w-9" />;
}
