"use client";

import { useSyncExternalStore } from "react";
import { MENUS, defaultLayout, layoutFor, menuLayoutCss, readMenuLayouts, saveMenuLayoutFor, serverMenuLayouts, subscribeMenuLayouts, type MenuDef } from "@/lib/menu-layouts";
import { QuestMenuSettings } from "./QuestMenuSettings";

/** Puts every context menu's items in your order and hides the ones you've hidden (mounted once, app-wide). */
export function MenuLayoutStyles() {
  const all = useSyncExternalStore(subscribeMenuLayouts, readMenuLayouts, serverMenuLayouts);
  const css = menuLayoutCss(all);
  return css ? <style>{css}</style> : null;
}

/** Settings › Menus: each context menu, folded, with its items to reorder and hide. */
export function MenusSettings({ isAdventure }: { isAdventure: boolean }) {
  const head = isAdventure ? "font-display text-[15px]" : "text-sm font-bold";
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Put each menu&rsquo;s items in your order, and hide the ones you don&rsquo;t use. Saved on this device.
      </p>
      <details className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
        <summary className={`cursor-pointer ${head}`}>Quest cards</summary>
        <p className="mb-2 mt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          The ⋯ on a quest, or right-click it.
        </p>
        <QuestMenuSettings />
      </details>
      {MENUS.map((m) => (
        <details key={m.id} className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
          <summary className={`cursor-pointer ${head}`}>{m.title}</summary>
          <p className="mb-2 mt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {m.hint}
          </p>
          <OneMenu menu={m} />
        </details>
      ))}
    </div>
  );
}

function OneMenu({ menu }: { menu: MenuDef }) {
  const all = useSyncExternalStore(subscribeMenuLayouts, readMenuLayouts, serverMenuLayouts);
  const layout = layoutFor(menu, all[menu.id]);
  const isDefault = JSON.stringify(layout) === JSON.stringify(defaultLayout(menu));
  const labelOf = (k: string) => menu.items.find((i) => i.key === k)?.label ?? k;
  const keep = (k: string) => !!menu.items.find((i) => i.key === k)?.keep;
  function move(i: number, dir: -1 | 1) {
    const order = [...layout.order];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveMenuLayoutFor(menu.id, { ...layout, order });
  }
  function toggle(k: string) {
    const hidden = layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k];
    saveMenuLayoutFor(menu.id, { ...layout, hidden });
  }
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/5 disabled:opacity-25";
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {layout.order.map((k, i) => {
          const hidden = layout.hidden.includes(k);
          return (
            <li key={k} className="flex min-h-10 items-center gap-1 rounded-lg pl-2.5" style={{ border: "1px solid rgba(139,112,64,.3)", opacity: hidden ? 0.6 : 1 }}>
              <span className={`min-w-0 flex-1 truncate text-[13.5px] ${hidden ? "line-through" : ""}`}>{labelOf(k)}</span>
              {!keep(k) && (
                <button type="button" role="switch" aria-checked={!hidden} onClick={() => toggle(k)} className="h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold" style={hidden ? { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink-soft)" } : { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
                  {hidden ? "Hidden" : "Shown"}
                </button>
              )}
              <button type="button" aria-label={`Move ${labelOf(k)} up`} disabled={i === 0} onClick={() => move(i, -1)} className={btn}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${labelOf(k)} down`} disabled={i === layout.order.length - 1} onClick={() => move(i, 1)} className={btn}>
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      {!isDefault && (
        <button type="button" onClick={() => saveMenuLayoutFor(menu.id, null)} className="self-start text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
          Back to the usual menu
        </button>
      )}
    </div>
  );
}
