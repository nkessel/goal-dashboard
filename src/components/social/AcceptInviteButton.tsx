"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "@/app/actions";

export function AcceptInviteButton({ code, inviterName }: { code: string; inviterName: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  function accept() {
    setError(null);
    startTransition(async () => {
      try {
        await acceptInviteAction(code);
        setDone(true);
        setTimeout(() => router.push("/feed"), 1200);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (done) {
    return <p className="text-sm text-emerald-600">You and {inviterName} are now friends 🎉 Redirecting…</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={accept}
        disabled={isPending}
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isPending ? "Adding…" : `Add ${inviterName} as a friend`}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
