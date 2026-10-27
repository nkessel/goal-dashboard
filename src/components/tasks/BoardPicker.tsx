"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";

export type BoardOption = { id: string; label: string };

/**
 * A tap-friendly board chooser: a button showing the current board that opens
 * a searchable list (nested boards indented under their parents), with a
 * "+ New board" row at the bottom. Replaces a native <select>, which on
 * phones squeezes "Family › Martin › End of Life" into a tiny wheel.
 */
export function BoardPicker({
  value,
  options,
  onChange,
  onCreate,
  isAdventure,
  fieldStyle,
}: {
  value: string | null;
  options: BoardOption[] | null;
  onChange: (id: string | null) => void;
  /** Create a board with this name and select it. */
  onCreate: (name: string) => Promise<void>;
  isAdventure: boolean;
  fieldStyle: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(() => setOpen(false), open);

  const current = options?.find((o) => o.id === value);
  const q = query.trim().toLowerCase();
  const all = options ?? [];
  // Boards inside boards fold away under their parent until opened (the current board's path starts open).
  const pathOpen = () => {
    const cur = options?.find((o) => o.id === value)?.label;
    const open = new Set<string>();
    if (cur) {
      const p = cur.split(" › ");
      for (let i = 1; i < p.length; i++) open.add(p.slice(0, i).join(" › "));
    }
    return open;
  };
  const [expanded, setExpanded] = useState<Set<string>>(pathOpen);
  // Opening the list jumps to the board the quest is on.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => listRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(raf);
  }, [open]);
  const hasKids = (label: string) => all.some((o) => o.label.startsWith(`${label} › `));
  const visible = (label: string) => {
    const p = label.split(" › ");
    for (let i = 1; i < p.length; i++) if (!expanded.has(p.slice(0, i).join(" › "))) return false;
    return true;
  };
  const shown = all.filter((o) => (q ? o.label.toLowerCase().includes(q) : visible(o.label)));

  async function create() {
    const name = (newName ?? "").trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(name);
      setNewName(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the board.");
    } finally {
      setCreating(false);
    }
  }

  const label = value === null ? "No board" : (current?.label ?? (options === null ? "Loading…" : "No board"));
  const parts = label.split(" › ");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setNewName(null);
          setExpanded((x) => new Set([...x, ...pathOpen()]));
          setOpen(true);
        }}
        aria-label={`Quest board: ${label}`}
        className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 text-left text-[13.5px]"
        style={fieldStyle}
      >
        <span className="min-w-0 flex-1 truncate">
          {parts.length > 1 && <span style={{ color: "var(--t-ink-soft)" }}>{parts.slice(0, -1).join(" › ")} › </span>}
          <span className={value ? "font-semibold" : undefined} style={value ? undefined : { color: "var(--t-ink-soft)" }}>
            {parts[parts.length - 1]}
          </span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: "var(--t-ink-soft)" }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" onClick={() => setOpen(false)}>
            <div className="overlay-fade-in absolute inset-0" style={{ background: "var(--t-overlay)" }} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose a quest board"
              onClick={(e) => e.stopPropagation()}
              className="sheet-slide-up-in parchment parchment-framed relative flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl"
              style={{ background: "var(--t-panel)", border: "2px solid var(--t-panel-border)", color: "var(--t-ink)" }}
            >
              <div className="relative z-[1] flex items-center gap-2 px-4 pb-2 pt-3.5">
                <h3 className={`flex-1 ${isAdventure ? "font-display text-[19px]" : "text-base font-bold"}`}>Choose a board</h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
                  ×
                </button>
              </div>
              {(options?.length ?? 0) > 7 && (
                <div className="relative z-[1] px-4 pb-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search boards…"
                    aria-label="Search boards"
                    className="h-10 w-full rounded-lg border px-3 text-[15px]"
                    style={fieldStyle}
                  />
                </div>
              )}
              <ul ref={listRef} className="relative z-[1] m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto overscroll-contain px-2 pb-2">
                {!q && (
                  <PickRow selected={value === null} onPick={() => (onChange(null), setOpen(false))} depth={0}>
                    <span style={{ color: "var(--t-ink-soft)" }}>No board</span>
                  </PickRow>
                )}
                {options === null && (
                  <li className="px-3 py-2 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                    Loading boards…
                  </li>
                )}
                {shown.map((o) => {
                  const p = o.label.split(" › ");
                  return (
                    <PickRow
                      key={o.id}
                      selected={o.id === value}
                      onPick={() => (onChange(o.id), setOpen(false))}
                      depth={q ? 0 : p.length - 1}
                      caret={!q && hasKids(o.label) ? { open: expanded.has(o.label), toggle: () => setExpanded((e) => { const n = new Set(e); if (n.has(o.label)) n.delete(o.label); else n.add(o.label); return n; }) } : null}
                    >
                      {q && p.length > 1 && <span style={{ color: "var(--t-ink-soft)" }}>{p.slice(0, -1).join(" › ")} › </span>}
                      {p[p.length - 1]}
                    </PickRow>
                  );
                })}
                {q && shown.length === 0 && (
                  <li className="px-3 py-2 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                    No board called that yet.
                  </li>
                )}
              </ul>
              <div className="relative z-[1] border-t px-4 py-3" style={{ borderColor: "rgba(120,90,40,.25)" }}>
                {newName === null ? (
                  <button
                    type="button"
                    onClick={() => setNewName(query.trim())}
                    className="hover-glow h-10 w-full rounded-full border border-dashed text-[14px] font-semibold"
                    style={{ borderColor: "#a88a3f", color: "var(--t-ink)" }}
                  >
                    + New quest board{query.trim() ? ` “${query.trim()}”` : ""}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void create())}
                      placeholder="New board name"
                      aria-label="New board name"
                      className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-[15px]"
                      style={fieldStyle}
                    />
                    <button
                      type="button"
                      disabled={creating || !newName.trim()}
                      onClick={() => void create()}
                      className="h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50"
                      style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                    >
                      {creating ? "…" : "Create"}
                    </button>
                  </div>
                )}
                {error && (
                  <p className="mt-1.5 text-sm" style={{ color: "var(--t-warn)" }}>
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function PickRow({ selected, onPick, depth, children, caret = null }: { selected: boolean; onPick: () => void; depth: number; children: React.ReactNode; caret?: { open: boolean; toggle: () => void } | null }) {
  return (
    <li className="flex items-center" data-selected={selected || undefined}>
      {caret ? (
        <button type="button" onClick={caret.toggle} aria-expanded={caret.open} aria-label={caret.open ? "Hide the boards inside" : "Show the boards inside"} className="flex h-11 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-black/[.05]" style={{ marginLeft: depth * 18 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: caret.open ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span aria-hidden className="w-8 shrink-0" style={{ marginLeft: depth * 18 }} />
      )}
      <button
        type="button"
        onClick={onPick}
        className="hover-glow flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-[15px]"
        style={{ background: selected ? "rgba(217,180,95,.28)" : undefined, fontWeight: selected ? 700 : 500 }}
      >
        <span className="min-w-0 flex-1">{children}</span>
        {selected && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="var(--t-good)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </li>
  );
}
