"use client";

import { useState } from "react";

export function InviteLinkBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/invite/${code}`;

  async function copy() {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, non-secure context); the link is still visible to copy manually.
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">Invite a friend</h3>
      <p className="text-xs text-zinc-500">
        Anyone who opens this link and signs in becomes your friend automatically.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          {path}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
