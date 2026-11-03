"use client";

import { useEffect, useState } from "react";

type Note = { id: string; body: string; at: string };

/** Strip the "— sent from /page" line the app adds, for editing; it's put back on save. */
const split = (b: string) => {
  const m = /\n\n— sent from [^\n]*$/.exec(b);
  return m ? { text: b.slice(0, m.index), tail: m[0] } : { text: b, tail: "" };
};

/**
 * Your latest notes, to read again or change (owner, Nov 3). Tap one to edit its words; Save puts them back.
 */
export function RecentNotes({ isAdventure, onBack }: { isAdventure: boolean; onBack: () => void }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/feedback/recent")
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((j: { notes?: Note[] }) => setNotes(j.notes ?? []))
      .catch(() => setNotes([]));
  }, []);
  const ink = isAdventure ? "#2a1c10" : "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  async function save(n: Note) {
    setBusy(true);
    setMsg(null);
    const body = text.trim() + split(n.body).tail;
    try {
      const r = await fetch("/api/feedback/recent", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: n.id, body }) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Couldn't save.");
      setNotes((l) => (l ?? []).map((x) => (x.id === n.id ? { ...x, body } : x)));
      setEditing(null);
      setMsg("✓ Saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3.5 pb-2 pt-0.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-semibold hover:bg-black/5" style={{ color: soft }}>
          ‹ Back to writing
        </button>
        <span className="ml-auto text-[12.5px]" style={{ color: soft }} aria-live="polite">
          {msg}
        </span>
      </div>
      {notes === null ? (
        <p className="m-0 text-[13.5px] italic" style={{ color: soft }}>
          Finding your notes…
        </p>
      ) : notes.length === 0 ? (
        <p className="m-0 text-[13.5px] italic" style={{ color: soft }}>
          No notes yet.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {notes.map((n) => {
            const { text: words } = split(n.body);
            const open = editing === n.id;
            return (
              <li key={n.id} className="due-in rounded-xl px-2.5 py-1.5" style={{ border: `1px solid ${open ? "#8a6116" : "var(--t-panel-border)"}`, background: open ? "rgba(255,250,235,.6)" : undefined }}>
                {open ? (
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      autoFocus
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key.toLowerCase() === "s") && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          void save(n);
                        }
                        if (e.key === "Escape") (e.stopPropagation(), setEditing(null));
                      }}
                      rows={4}
                      aria-label="Edit this note"
                      className="w-full resize-y rounded-lg border px-2.5 py-1.5 text-[16px] leading-relaxed"
                      style={{ borderColor: "var(--t-panel-border)", color: ink }}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => setEditing(null)} className="h-8 px-2 text-[13px] underline" style={{ color: soft }}>
                        Keep as it was
                      </button>
                      <button type="button" disabled={busy || !text.trim()} onClick={() => void save(n)} className="h-8 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => (setEditing(n.id), setText(words), setMsg(null))} className="flex w-full flex-col items-start text-left" title="Edit this note">
                    <span className="line-clamp-2 text-[14px] leading-snug" style={{ color: ink }}>
                      {words}
                    </span>
                    <span className="text-[11.5px]" style={{ color: soft }}>
                      {new Date(n.at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · tap to edit
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
