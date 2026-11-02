"use client";

import { useRef, useState } from "react";
import type { FileRef } from "@/lib/file-refs";

/** A quiet "📎 Add a file" chip: keeps a private file (a form, an application) with a card or quest. */
export function AddFile({ cardId, taskId, onAdded }: { cardId?: string; taskId?: string; onAdded: (f: FileRef) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    for (const f of Array.from(files)) {
      const body = new FormData();
      body.set("file", f);
      if (cardId) body.set("cardId", cardId);
      if (taskId) body.set("taskId", taskId);
      try {
        const r = (await (await fetch("/api/attachments", { method: "POST", body })).json()) as { ok: boolean; file?: FileRef; error?: string };
        if (r.ok && r.file) onAdded(r.file);
        else setErr(r.error ?? "Couldn't add it.");
      } catch {
        setErr("Couldn't add it. Try again?");
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => (e.stopPropagation(), input.current?.click())}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px]"
        style={{ border: "1px dashed rgba(160,120,40,.55)", color: "#7a5a1e", background: "transparent" }}
      >
        {busy ? "Adding…" : "Add a private file"}
      </button>
      <input ref={input} type="file" multiple hidden onChange={(e) => send(e.target.files)} />
      {err && (
        <span className="text-[12px]" style={{ color: "#8b2c1a" }}>
          {err}
        </span>
      )}
    </span>
  );
}
