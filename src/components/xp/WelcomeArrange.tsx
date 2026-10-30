"use client";

import { useState } from "react";
import { CHECKIN_ICONS, CHECKIN_STYLES, checkinIconOf, checkinStyleOf, patchFx, type FxSettings } from "@/lib/celebration-fx";
import { WELCOME_ELS, backHours, backOwnOn, greetingPool, moveEl, ownGreetings, ownLines, ownLinesOn, toggleEl, welcomeShows, type WelcomeEl } from "@/lib/welcome";
import { CASTLE_DESIGNS, castleOf } from "./CastleArt";
import { CheckinIcon } from "./CheckinIcon";
import { PhraseList, WiseLines } from "@/components/settings/LineLists";

/*
 * The welcome screen's settings, shown on the welcome screen itself: tap its
 * gear and each part gets its own small controls right where it sits (show
 * or hide, move up or down, and its own options), with the few screen-wide
 * choices in a strip at the top. Every change applies at once.
 */

const INK = "#3d2f18";
const SOFT = "#6b5631";
const CHIP = { border: "1.5px solid #b39a6a", background: "rgba(255,250,238,.7)", color: INK } as const;
const CHIP_ON = { border: "1.5px solid #4a3913", background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10" } as const;
const set = (patch: Partial<FxSettings>) => patchFx(patch);

/** The screen-wide choices: when it opens, the castle, confetti. */
export function ArrangeStrip({ fx, onDone }: { fx: FxSettings; onDone: () => void }) {
  const h = backHours(fx);
  return (
    <div className="reveal flex w-full flex-col gap-2 rounded-xl px-3 py-2.5 text-left" style={{ border: "1.5px dashed rgba(139,112,64,.6)", background: "rgba(255,250,238,.55)" }}>
      <div className="flex items-center gap-2">
        <span className="font-display text-[17px]" style={{ color: "#8a6116" }}>
          Arranging this screen
        </span>
        <button type="button" onClick={onDone} className="ml-auto h-8 rounded-full px-4 text-[13.5px] font-bold" style={CHIP_ON}>
          Done
        </button>
      </div>
      <p className="m-0 -mt-1 text-[12px] leading-snug" style={{ color: SOFT }}>
        Each part below has its own controls. Changes apply as you make them.
      </p>

      <Row label="Opens">
        <button type="button" onClick={() => set({ welcomeBackHours: Math.max(1, h - 1) })} disabled={!h} aria-label="Fewer hours" className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] disabled:opacity-35" style={CHIP}>
          −
        </button>
        <span className="min-w-[110px] text-center text-[13.5px] font-semibold tabular-nums" style={{ color: INK }}>
          {h ? `+ every ${h} ${h === 1 ? "hour" : "hours"}` : "first visit only"}
        </span>
        <button type="button" onClick={() => set({ welcomeBackHours: Math.min(12, (h || 0) + 1) })} disabled={h >= 12} aria-label="More hours" className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] disabled:opacity-35" style={CHIP}>
          +
        </button>
        <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: SOFT }}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--t-gold-deep)]" checked={h === 0} onChange={(e) => set({ welcomeBackHours: e.target.checked ? 0 : 5 })} />
          first visit only
        </label>
      </Row>

      <Row label="Castle">
        {CASTLE_DESIGNS.map((d) => {
          const on = castleOf(fx.welcomeCastle) === d.key;
          return (
            <button key={d.key} type="button" role="radio" aria-checked={on} title={d.hint} onClick={() => set({ welcomeCastle: d.key })} className="h-8 rounded-full px-3 text-[12.5px] font-semibold" style={on ? CHIP_ON : CHIP}>
              {d.label}
            </button>
          );
        })}
      </Row>

      <label className="flex min-h-8 items-center gap-2 text-[13px]" style={{ color: INK }}>
        <input type="checkbox" className="h-4 w-4 accent-[var(--t-gold-deep)]" checked={fx.welcomeConfetti !== false} onChange={() => set({ welcomeConfetti: fx.welcomeConfetti === false })} />
        Confetti on the day&rsquo;s first visit
      </label>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[52px] shrink-0 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: "#8a6116" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Under the greeting: which greetings take turns, and your own. */
export function GreetingOptions({ fx }: { fx: FxSettings }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <OptionsToggle open={open} onClick={() => setOpen((v) => !v)} label="Greetings" />
      {open && (
        <div className="reveal flex w-full flex-col gap-2 rounded-xl p-2.5 text-left" style={{ border: "1px solid rgba(139,112,64,.4)", background: "rgba(255,250,238,.6)" }}>
          <label className="flex min-h-8 items-center gap-2 text-[13.5px]" style={{ color: INK }}>
            <input type="checkbox" className="h-4 w-4 accent-[var(--t-gold-deep)]" checked={backOwnOn(fx)} onChange={() => set({ welcomeBackOwn: !backOwnOn(fx) })} />
            Use my own words too
          </label>
          {backOwnOn(fx) && (
            <textarea
              value={ownGreetings(fx).join("\n")}
              onChange={(e) => set({ welcomeBackText: e.target.value.slice(0, 1200), welcomeText: "" })}
              rows={3}
              placeholder={"One per line; they take turns with the others.\ne.g. The hearth is warm, come in"}
              aria-label="Your own greetings"
              className="reveal rounded-lg border px-3 py-2 text-[16px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.9)", color: "#2a1c10" }}
            />
          )}
          <PhraseList
            title="Choose which greetings show"
            lines={greetingPool(fx)}
            isOn={(l) => !(fx.welcomeBackOff ?? []).includes(l)}
            onToggle={(l, on) => set({ welcomeBackOff: on ? (fx.welcomeBackOff ?? []).filter((x) => x !== l) : [...(fx.welcomeBackOff ?? []), l] })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One part of the screen while arranging: a slim header (show or hide, its
 * name, move up or down, and its own options where it has some) above the
 * part itself. A hidden part keeps only its header, faded.
 */
export function ArrangeFrame({ el, fx, first, last, children, empty }: { el: WelcomeEl; fx: FxSettings; first: boolean; last: boolean; children: React.ReactNode; empty?: string }) {
  const meta = WELCOME_ELS.find((e) => e.key === el)!;
  const on = welcomeShows(fx, el);
  const hasOptions = el === "checkin" || el === "line";
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-xl px-2 pb-2 pt-1" style={{ border: `1.5px ${on ? "solid" : "dashed"} rgba(139,112,64,${on ? 0.45 : 0.35})`, background: on ? "rgba(255,250,238,.35)" : "transparent" }}>
      <div className="flex min-h-9 items-center gap-1">
        <button type="button" role="switch" aria-checked={on} onClick={() => set(toggleEl(fx, el))} title={on ? "Showing: tap to hide" : "Hidden: tap to show"} aria-label={`${on ? "Hide" : "Show"} ${meta.label}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={on ? CHIP_ON : CHIP}>
          <Eye open={on} />
        </button>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold" style={{ color: on ? INK : SOFT }} title={meta.hint}>
          {meta.label}
        </span>
        {hasOptions && on && <OptionsToggle open={open} onClick={() => setOpen((v) => !v)} label="Options" small />}
        <button type="button" onClick={() => set(moveEl(fx, el, -1))} disabled={first} aria-label={`Move ${meta.label} up`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] disabled:opacity-25" style={CHIP}>
          ↑
        </button>
        <button type="button" onClick={() => set(moveEl(fx, el, 1))} disabled={last} aria-label={`Move ${meta.label} down`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] disabled:opacity-25" style={CHIP}>
          ↓
        </button>
      </div>
      {on && open && el === "checkin" && <CheckinOptions fx={fx} />}
      {on && open && el === "line" && <LineOptions fx={fx} />}
      {on &&
        (children ? (
          // The part as it looks, not live while arranging.
          <div inert className="pointer-events-none flex w-full flex-col items-center opacity-90">
            {children}
          </div>
        ) : (
          <p className="m-0 text-[12.5px] italic" style={{ color: SOFT }}>
            {empty ?? "Shows when there's something to show."}
          </p>
        ))}
      {!on && (
        <p className="m-0 text-left text-[12px] leading-snug" style={{ color: SOFT }}>
          {meta.hint}
        </p>
      )}
    </div>
  );
}

function OptionsToggle({ open, onClick, label, small = false }: { open: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 font-semibold ${small ? "h-8 text-[12px]" : "h-8 text-[12.5px]"}`} style={CHIP}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

function CheckinOptions({ fx }: { fx: FxSettings }) {
  return (
    <div className="reveal flex flex-col gap-2 rounded-xl p-2.5 text-left" style={{ border: "1px solid rgba(139,112,64,.4)", background: "rgba(255,250,238,.6)" }}>
      <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: "#8a6116" }}>
        The button
      </span>
      <div role="radiogroup" aria-label="The Check in button's look" className="flex flex-wrap justify-center gap-1.5">
        {CHECKIN_STYLES.map((c) => {
          const on = checkinStyleOf(fx).key === c.key;
          return (
            <button key={c.key} type="button" role="radio" aria-checked={on} aria-label={c.label} title={c.hint} onClick={() => set({ checkinStyle: c.key })} className="rounded-full p-0.5" style={{ boxShadow: on ? "0 0 0 2px #8a6116" : undefined }}>
              <span className="font-display flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px]" style={c.style}>
                <CheckinIcon icon={checkinIconOf(fx)} /> Check in
              </span>
            </button>
          );
        })}
      </div>
      <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: "#8a6116" }}>
        Its icon
      </span>
      <div role="radiogroup" aria-label="The Check in button's icon" className="flex flex-wrap gap-1">
        {CHECKIN_ICONS.map((c) => {
          const on = checkinIconOf(fx) === c.key;
          return (
            <button key={c.key} type="button" role="radio" aria-checked={on} aria-label={c.label} title={c.label} onClick={() => set({ checkinIcon: c.key })} className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[12px] font-semibold" style={on ? checkinStyleOf(fx).style : CHIP}>
              {c.key === "none" ? "None" : <CheckinIcon icon={c.key} size={18} />}
            </button>
          );
        })}
      </div>
      {(
        [
          ["welcomeSleep", "Last night's sleep times, on the day's first visit"],
          ["welcomeMetrics", "Mood and everything else you track, open"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex min-h-8 items-center gap-2 text-[13px]" style={{ color: INK }}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--t-gold-deep)]" checked={fx[k] !== false} onChange={() => set({ [k]: fx[k] === false })} />
          {label}
        </label>
      ))}
    </div>
  );
}

function LineOptions({ fx }: { fx: FxSettings }) {
  return (
    <div className="reveal flex flex-col gap-2 rounded-xl p-2.5 text-left" style={{ border: "1px solid rgba(139,112,64,.4)", background: "rgba(255,250,238,.6)" }}>
      <label className="flex min-h-8 items-center gap-2 text-[13.5px]" style={{ color: INK }}>
        <input type="checkbox" className="h-4 w-4 accent-[var(--t-gold-deep)]" checked={ownLinesOn(fx)} onChange={() => set({ welcomeOwnOn: !ownLinesOn(fx) })} />
        Add my own wise lines
      </label>
      {ownLinesOn(fx) && (
        <textarea
          value={fx.welcomeOwnLines ?? ""}
          onChange={(e) => set({ welcomeOwnLines: e.target.value.slice(0, 2400) })}
          rows={3}
          placeholder={"One per line; mixed in with the built-in lines.\ne.g. Breathe. Then the next small thing."}
          aria-label="Your own wise lines"
          className="reveal rounded-lg border px-3 py-2 text-[16px]"
          style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.9)", color: "#2a1c10" }}
        />
      )}
      <WiseLines own={ownLines(fx)} />
    </div>
  );
}

function Eye({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      {open ? <circle cx="12" cy="12" r="2.8" fill="currentColor" /> : <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
    </svg>
  );
}
