"use client";

import { useState, useTransition } from "react";
import { updateAvatarAction } from "@/app/actions";

const BASES = ["🙂", "🦸", "🧝", "🧙", "🥷", "🐱", "🦊", "🐻", "🐉", "👑"];
const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#64748b"];
const ACCESSORIES = [null, "👑", "🎩", "🕶️", "⚔️", "🛡️", "🧣", "🌟"];

export function AvatarBuilder({
  initialBase,
  initialColor,
  initialAccessory,
}: {
  initialBase: string;
  initialColor: string;
  initialAccessory: string | null;
}) {
  const [base, setBase] = useState(initialBase);
  const [color, setColor] = useState(initialColor);
  const [accessory, setAccessory] = useState<string | null>(initialAccessory);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateAvatarAction(base, color, accessory);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-3xl"
          style={{ backgroundColor: `${color}33`, border: `2px solid ${color}` }}
        >
          {base}
          {accessory && <span className="absolute -right-1 -top-1 text-lg">{accessory}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Your avatar</span>
          <span className="text-xs text-zinc-500">Shown on the Friend Feed and in comments.</span>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">Character</p>
        <div className="flex flex-wrap gap-1">
          {BASES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBase(b)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                base === b ? "ring-2 ring-offset-1" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              style={base === b ? { ["--tw-ring-color" as string]: color } : undefined}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">Color</p>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-zinc-400" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">Accessory (Adventure mode flair)</p>
        <div className="flex flex-wrap gap-1">
          {ACCESSORIES.map((a) => (
            <button
              key={a ?? "none"}
              type="button"
              onClick={() => setAccessory(a)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                accessory === a ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {a ?? "🚫"}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="self-start rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save avatar"}
      </button>
    </div>
  );
}
