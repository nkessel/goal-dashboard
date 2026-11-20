"use client";

import { useRef, useState } from "react";
import { inventoryPhotoAction } from "@/app/actions";
import type { Task } from "@/lib/data/types";
import { saveCalCardLook, useCalCardLook } from "@/lib/use-quest-cal";
import { questArt } from "./CalendarTaskChip";

/** The board editor's colours (owner, Nov 12: a calendar quest card's own background, a colour or a picture). */
const COLORS = ["#fde8d0", "#dcefe0", "#e0e7fb", "#fbe0e6", "#fff4c2"];
const WHEEL = "conic-gradient(#e06666, #f6b26b, #ffd966, #93c47d, #6fa8dc, #8e7cc3, #c27ba0, #e06666)";
const GOLD = "#a88a3f";

/** `part` shows only the colours (the quest editor's + Color) or only the pictures (its portrait editor; owner, Nov 20). */
export function CardLookPicker({ task, part }: { task: Task; part?: "colour" | "picture" }) {
  const look = useCalCardLook(task.id);
  const art = questArt(task);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (l: { color?: string; image?: string } | null) => void saveCalCardLook(task.id, l).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't save that."));
  const ring = (on: boolean) => ({ borderColor: on ? GOLD : "rgba(139,112,64,.35)", borderWidth: on ? 2 : 1 });
  const custom = !!look?.color && !COLORS.includes(look.color);
  const photo = !!look?.image && look.image !== "portrait";
  return (
    <div className="flex flex-col gap-2" data-card-look>
      {part !== "picture" && (
      <>
      <span className="text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
        Colour
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => set(null)} aria-label="Parchment (as it was)" title="Parchment" className="h-7 w-7 rounded-full border" style={{ background: "linear-gradient(180deg, #fbf3dc, #eedcb3)", ...ring(!look) }} />
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => set({ color: c })} aria-label={c} className="h-7 w-7 rounded-full border" style={{ background: c, ...ring(look?.color === c && !look.image) }} />
        ))}
        <label title="Pick any colour" className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border" style={{ background: custom ? look!.color : WHEEL, ...ring(custom && !look?.image) }}>
          <input type="color" value={custom ? look!.color : "#c9a86a"} onChange={(e) => set({ color: e.target.value })} aria-label="Pick any colour" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
      </>
      )}
      {part !== "colour" && (
      <>
      <span className="text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
        {part === "picture" ? "As the card's background" : "Picture"}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {art && (
          <button type="button" onClick={() => set(look?.image === "portrait" ? null : { image: "portrait" })} aria-pressed={look?.image === "portrait"} className="qe-fact flex h-8 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[13px] font-semibold" data-open={look?.image === "portrait" ? "true" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the quest's own portrait */}
            <img src={art} alt="" className="h-6 w-6 rounded-full object-cover" />
            Its portrait
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="qe-fact flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold" data-open={photo ? "true" : undefined}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the chosen photo
            <img src={look!.image} alt="" className="-ml-1.5 h-6 w-6 rounded-full object-cover" />
          ) : (
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
          )}
          {busy ? "Adding…" : photo ? "Another photo" : "My photo"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setErr(null);
            try {
              const fd = new FormData();
              fd.set("file", f);
              fd.set("mode", "photo");
              const url = await inventoryPhotoAction(fd);
              set({ image: url });
            } catch (er) {
              setErr(er instanceof Error ? er.message : "Couldn't add that photo.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      </>
      )}
      {err && (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
          {err}
        </p>
      )}
    </div>
  );
}
