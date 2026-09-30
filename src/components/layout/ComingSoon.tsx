export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      <p className="max-w-sm text-sm text-zinc-500">
        Coming later in the build — see SPEC.md&apos;s &quot;Suggested Build Priority&quot;.
      </p>
    </div>
  );
}
