import Link from "next/link";

export function SettingsSubpage({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Link href="/settings" className="self-start text-sm font-medium text-zinc-500 hover:underline">
        ‹ Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        {blurb && <p className="text-sm text-zinc-500">{blurb}</p>}
      </div>
      {children}
    </div>
  );
}
