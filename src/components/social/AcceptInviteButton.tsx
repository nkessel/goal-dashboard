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
        setTimeout(() => router.push("/feed"), 1400);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't join. Try opening the link again.");
      }
    });
  }

  if (done) {
    return (
      <p role="status" className="m-0 text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
        You&apos;re in {inviterName}&apos;s party. Taking you there…
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={accept}
        disabled={isPending}
        className="hover-glow h-12 rounded-full px-7 text-[16px] font-bold disabled:opacity-60"
        style={{ background: "var(--t-gold)", color: "#2a1c10" }}
      >
        {isPending ? "Joining…" : `Join ${inviterName}'s party`}
      </button>
      {error && (
        <p role="alert" className="m-0 text-[14px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
