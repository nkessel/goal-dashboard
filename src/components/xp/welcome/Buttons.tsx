import { BUTTON_NAMES, ButtonKey, GILT, isButtonKey } from "@/components/xp/welcome/shared";
import { loadFx, patchFx, type FxSettings } from "@/lib/celebration-fx";
import { type WelcomeEl } from "@/lib/welcome";
import { useRef } from "react";

/**
 * A welcome part whose button can be shaped in place: right-click it, or hold it on a phone, and its
 * editor folds open under it (no popup). Only presses on the part's own button or label count, so
 * fields and sliders inside keep their own right-click.
 */
export function ButtonShell({ el, onEdit, children }: { el: WelcomeEl; onEdit: (k: ButtonKey) => void; children: React.ReactNode }) {
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const onButton = (t: EventTarget | null) => {
    const n = t as HTMLElement | null;
    if (!n?.closest || n.closest("input, textarea, [contenteditable='true'], [data-button-editor]")) return false;
    return !!n.closest("button, label");
  };
  const stop = () => {
    if (hold.current) clearTimeout(hold.current.t);
    hold.current = null;
  };
  if (!isButtonKey(el)) return <div className="flex w-full flex-col items-center">{children}</div>;
  return (
    <div
      className="relative flex w-full flex-col items-center [-webkit-touch-callout:none]"
      onContextMenu={(e) => {
        if (!onButton(e.target)) return;
        e.preventDefault();
        onEdit(el);
      }}
      onPointerDown={(e) => {
        fired.current = false;
        if (e.pointerType === "mouse" || !onButton(e.target)) return;
        const x = e.clientX;
        const y = e.clientY;
        hold.current = {
          x,
          y,
          t: setTimeout(() => {
            fired.current = true;
            hold.current = null;
            navigator.vibrate?.(8);
            onEdit(el);
          }, 550),
        };
      }}
      onPointerMove={(e) => {
        const h = hold.current;
        if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) stop();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onClickCapture={(e) => {
        // The tap that ended a hold doesn't also open the part.
        if (!fired.current) return;
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/** The editor that folds open under a welcome button: its words, an emoji for its icon, and its XP. */
export function ButtonEditor({ k, fx, pays, onDone, children, onSnooze, onHide }: { k: ButtonKey; fx: FxSettings; pays: boolean; onDone: () => void; children?: React.ReactNode; onSnooze?: () => void; onHide?: () => void }) {
  const cur = fx.welcomeButtons?.[k] ?? {};
  const set = (patch: { text?: string; icon?: string; xp?: number }) => {
    const all = { ...(loadFx().welcomeButtons ?? {}) };
    const next = { ...(all[k] ?? {}), ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined || next[key] === "") delete next[key];
    all[k] = next;
    patchFx({ welcomeButtons: all });
  };
  const field = "bare-input h-8 min-w-0 rounded-none border-0 border-b bg-transparent px-1 text-[14px] focus:outline-none";
  const line = { borderColor: "#b39a6a", color: "#2a1c10" };
  return (
    <div data-button-editor="" className="mt-1.5 flex w-full max-w-[420px] flex-col gap-1.5 rounded-xl px-3 py-2 text-[13px]" style={{ border: "1px solid rgba(139,112,64,.45)", background: "rgba(255,250,238,.75)", color: "#2a1c10" }}>
      <label className="flex items-center gap-2">
        <span className="w-12 shrink-0 font-semibold">Words</span>
        <input defaultValue={cur.text ?? ""} placeholder={BUTTON_NAMES[k]} maxLength={60} onChange={(e) => set({ text: e.target.value })} className={`${field} flex-1`} style={line} />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-12 shrink-0 font-semibold">Icon</span>
        <input defaultValue={cur.icon ?? ""} placeholder="an emoji, e.g. 🌙" maxLength={4} onChange={(e) => set({ icon: e.target.value.trim() })} className={`${field} w-28`} style={line} />
      </label>
      {pays && (
        <label className="flex items-center gap-2">
          <span className="w-12 shrink-0 font-semibold">XP</span>
          <input type="number" inputMode="numeric" min={0} max={50} defaultValue={cur.xp ?? 5} onChange={(e) => set({ xp: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) })} className={`${field} w-16 tabular-nums`} style={line} />
          <span style={{ color: "#6b5631" }}>once a day, when you fill it in</span>
        </label>
      )}
      {children}
      {(onSnooze || onHide) && (
        <div className="flex items-center gap-3 text-[12.5px]">
          {onSnooze && (
            <button type="button" onClick={onSnooze} className="underline underline-offset-2" style={{ color: "#6b5631" }}>
              Snooze till tomorrow
            </button>
          )}
          {onHide && (
            <button type="button" onClick={onHide} className="underline underline-offset-2" style={{ color: "#6b5631" }}>
              Hide it (the gear brings it back)
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onDone} className="h-8 rounded-full px-4 text-[13px] font-bold" style={GILT}>
          Done
        </button>
      </div>
    </div>
  );
}
