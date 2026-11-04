"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { keepInTouchAction, saveKeepInTouchAction } from "@/app/actions";
import { Bar } from "@/components/habits/CleaningCheckIn";
import { Fold } from "@/components/ui/Fold";
import { PACES, dayKeyOf, needOn, type Friend } from "@/lib/keep-in-touch";

/**
 * Friends to keep in touch with (owner, Nov 4), beside the calendars: each a bar like the cleaning
 * list's, the most due first. Drag a bar any time; some rise on their own at a pace you set.
 * "Reached out ✓" brings one back to calm. Tap a name for its pace, to rename or remove it.
 */
export function KeepInTouch() {
  const [list, setList] = useState<Friend[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const today = dayKeyOf(new Date());
  const sortIds = (l: Friend[]) => [...l].sort((a, b) => needOn(b, today) - needOn(a, today)).map((f) => f.id);
  useEffect(() => {
    let live = true;
    keepInTouchAction()
      .then((l) => {
        if (!live) return;
        setList(l);
        setOrder(sortIds(l));
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Rows glide to their new places when the order changes.
  const box = useRef<HTMLUListElement>(null);
  const tops = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>("[data-friend]").forEach((n) => {
      const id = n.dataset.friend!;
      const now = n.getBoundingClientRect().top;
      const was = tops.current.get(id);
      if (was !== undefined && Math.abs(was - now) > 1) n.animate([{ transform: `translateY(${was - now}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
      tops.current.set(id, now);
    });
  }, [order]);

  const save = (next: Friend[], resort = true) => {
    setList(next);
    if (resort) setOrder(sortIds(next));
    start(async () => {
      try {
        await saveKeepInTouchAction(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  };
  const set = (id: string, patch: Partial<Friend>, resort = true) => list && save(list.map((f) => (f.id === id ? { ...f, ...patch } : f)), resort);
  const add = () => {
    const n = draft.replace(/\s+/g, " ").trim();
    if (!n || !list) return;
    setDraft("");
    save([...list, { id: Math.random().toString(36).slice(2, 10), name: n.slice(0, 60), need: 5, at: today, fullDays: 30 }]);
  };

  if (!list) return <p className="m-0 px-2 py-2 text-[13px] italic" style={{ color: "var(--t-ink-soft)" }}>Opening…</p>;
  const byId = new Map(list.map((f) => [f.id, f]));
  const shown = [...order.filter((id) => byId.has(id)), ...list.filter((f) => !order.includes(f.id)).map((f) => f.id)];
  const chip = "h-8 rounded-full px-2.5 text-[12.5px] font-semibold";
  return (
    <div className="flex flex-col gap-1">
      <ul ref={box} className="m-0 flex list-none flex-col gap-1 p-0">
        {shown.map((id) => {
          const f = byId.get(id)!;
          const v = needOn(f, today);
          return (
            <li key={id} data-friend={id} className="flex flex-col rounded-lg px-1.5 py-1" style={{ background: v >= 7 ? "rgba(192,86,58,.08)" : undefined }}>
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => setOpen((o) => (o === id ? null : id))} aria-expanded={open === id} className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold" style={{ color: "var(--t-ink)" }} title="Pace, rename or remove">
                  {f.name}
                  {f.fullDays && <span className="ml-1.5 text-[11.5px] font-normal" style={{ color: "var(--t-ink-soft)" }}>rises over {PACES.find((p) => p.days === f.fullDays)?.label.toLowerCase() ?? `${f.fullDays} days`}</span>}
                </button>
                <button type="button" onClick={() => set(id, { need: 0, at: today })} className="h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold" style={{ border: "1px solid #8fb86a", color: "#3f6a2c" }} title="You reached out: back to calm">
                  Reached out ✓
                </button>
              </span>
              <Bar value={v} ends={[<span key="a">💚</span>, <span key="b">💬</span>]} label={`How due reaching out to ${f.name} is`} onCommit={(n) => set(id, { need: n, at: today })} />
              <Fold open={open === id}>
                <div className="flex flex-col gap-1.5 pb-1 pl-1">
                  <input defaultValue={f.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== f.name && set(id, { name: e.target.value.trim().slice(0, 60) }, false)} aria-label="Name" className="h-8 rounded-lg border px-2 text-[16px] sm:text-[13.5px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: "var(--t-ink)" }} />
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="mr-0.5 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>Rises to full over</span>
                    {PACES.map((p) => (
                      <button key={p.label} type="button" onClick={() => set(id, { fullDays: p.days, need: v, at: today })} aria-pressed={f.fullDays === p.days} className={chip} style={f.fullDays === p.days ? { background: "var(--t-gold, #e2bb5c)", border: "1px solid #8a6116", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
                        {p.label}
                      </button>
                    ))}
                  </span>
                  <button type="button" onClick={() => (setOpen(null), save(list.filter((x) => x.id !== id)))} className="self-start text-[12.5px] underline underline-offset-2" style={{ color: "#8a3f2c" }}>
                    Remove {f.name}
                  </button>
                </div>
              </Fold>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && (
        <p className="m-0 px-2 text-[13px] italic" style={{ color: "var(--t-ink-soft)" }}>
          Add the friends you want to stay close to.
        </p>
      )}
      <form className="flex gap-1 px-1" onSubmit={(e) => (e.preventDefault(), add())}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ Add a friend" aria-label="Add a friend" className="h-8 min-w-0 flex-1 rounded-lg border border-dashed px-2 text-[16px] sm:text-[13.5px]" style={{ borderColor: "#b39a6a", background: "transparent", color: "var(--t-ink)" }} />
        {draft.trim() && (
          <button type="submit" className="h-8 shrink-0 rounded-full px-3 text-[13px] font-bold" style={{ background: "var(--t-gold, #e2bb5c)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Add
          </button>
        )}
      </form>
      {error && <p className="m-0 px-2 text-[12px]" style={{ color: "var(--t-warn)" }}>{error}</p>}
    </div>
  );
}
