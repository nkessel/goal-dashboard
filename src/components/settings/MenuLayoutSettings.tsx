"use client";

import { useSyncExternalStore } from "react";
import { MENUS, defaultLayout, layoutFor, menuLayoutCss, readMenuLayouts, saveMenuLayoutFor, serverMenuLayouts, subscribeMenuLayouts, type MenuDef } from "@/lib/menu-layouts";
import { QuestMenuSettings } from "./QuestMenuSettings";
import { QuestEditorLayoutSettings } from "./QuestEditorLayoutSettings";
import { DragList } from "./DragList";

/** Puts every context menu's items in your order and hides the ones you've hidden (mounted once, app-wide). */
export function MenuLayoutStyles() {
  const all = useSyncExternalStore(subscribeMenuLayouts, readMenuLayouts, serverMenuLayouts);
  const css = menuLayoutCss(all);
  return css ? <style>{css}</style> : null;
}

/** Settings › Layout: the quest and habit editors and each context menu, folded, with their parts to drag into order and hide. */
export function MenusSettings({ isAdventure, openGroup }: { isAdventure: boolean; /** "quest-editor" when the editor's gear sent you here. */ openGroup?: string }) {
  const head = isAdventure ? "font-display text-[15px]" : "text-sm font-bold";
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Drag items into your order (hold on a phone). Swipe one left to hide it. Saved on this device.
      </p>
      <h4 className={`m-0 mt-1 ${head}`}>Editors</h4>
      <details open={openGroup === "quest-editor" || undefined} className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
        <summary className={`cursor-pointer ${head}`}>Quest editor</summary>
        <p className="mb-2 mt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          What shows straight away when you make or edit a quest, and what waits under Advanced settings.
        </p>
        <QuestEditorLayoutSettings />
      </details>
      {MENUS.filter((m) => m.id.endsWith("-editor")).map((m) => (
        <details key={m.id} className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
          <summary className={`cursor-pointer ${head}`}>{m.title}</summary>
          <p className="mb-2 mt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {m.hint}
          </p>
          <OneMenu menu={m} />
        </details>
      ))}
      <h4 className={`m-0 mt-2 ${head}`}>Context menus</h4>
      <details className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
        <summary className={`cursor-pointer ${head}`}>Quest cards</summary>
        <p className="mb-2 mt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          The ⋯ on a quest, or right-click it.
        </p>
        <QuestMenuSettings />
      </details>
      {MENUS.filter((m) => !m.id.endsWith("-editor")).map((m) => (
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

export function OneMenu({ menu }: { menu: MenuDef }) {
  const all = useSyncExternalStore(subscribeMenuLayouts, readMenuLayouts, serverMenuLayouts);
  const layout = layoutFor(menu, all[menu.id]);
  const isDefault = JSON.stringify(layout) === JSON.stringify(defaultLayout(menu));
  const labelOf = (k: string) => menu.items.find((i) => i.key === k)?.label ?? k;
  const keep = (k: string) => !!menu.items.find((i) => i.key === k)?.keep;
  function toggle(k: string) {
    const hidden = layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k];
    saveMenuLayoutFor(menu.id, { ...layout, hidden });
  }
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      <DragList
        id={`menu-${menu.id}`}
        ids={layout.order}
        onReorder={(order) => saveMenuLayoutFor(menu.id, { ...layout, order })}
        row={(k) => ({ label: labelOf(k), toggle: keep(k) ? null : { hidden: layout.hidden.includes(k), onToggle: () => toggle(k) } })}
      />
      {!isDefault && (
        <button type="button" onClick={() => saveMenuLayoutFor(menu.id, null)} className="self-start text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
          Back to the usual {menu.id.endsWith("-editor") ? "layout" : "menu"}
        </button>
      )}
    </div>
  );
}

