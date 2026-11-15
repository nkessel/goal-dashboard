"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removePartyMemberAction } from "@/app/actions";
import { SettingsGear } from "@/components/ui/SettingsGear";
import { setPartyView, usePartyView, PARTY_VIEW_OPTIONS, type PartyView } from "@/lib/party-view";

/** Shows its children only while that part of the Guild Hall is switched on in Settings. */
export function PartyShow({ k, children }: { k: keyof PartyView; children: React.ReactNode }) {
  const view = usePartyView();
  return view[k] ? <>{children}</> : null;
}

type Member = { id: string; name: string; isYou: boolean; streak: number; xp: number; quests: number; quietDays: number | null };

/** This week in the party: everyone's XP and quests side by side, streaks, and a nudge for anyone who's been quiet. */
export function PartyWeekBoard({ members, isAdventure }: { members: Member[]; isAdventure: boolean }) {
  const view = usePartyView();
  const router = useRouter();
  // Remove someone: a quiet ⋯ on their row asks in place (owner, Nov 9: "No remove button here for party members").
  const [asking, setAsking] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const remove = (id: string) =>
    start(async () => {
      setError(null);
      try {
        await removePartyMemberAction(id);
        setGone((g) => [...g, id]);
        setAsking(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove them.");
      }
    });
  if (!view.week && !view.quiet) return null;
  members = members.filter((m) => !gone.includes(m.id));
  const ranked = [...members].sort((a, b) => b.xp - a.xp);
  const top = Math.max(1, ...ranked.map((m) => m.xp));
  const quiet = members.filter((m) => !m.isYou && m.quietDays !== null && m.quietDays >= 3);
  return (
    <section className={`relative flex flex-col gap-2.5 rounded-2xl px-4 py-3.5 ${isAdventure ? "parchment parchment-framed" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
      <SettingsGear to="party-view" label="What the Guild Hall shows" tone={isAdventure ? "adventure" : "calm"} size={28} className="absolute -right-1.5 -top-2.5 z-[3]" />
      {view.week && members.length > 1 && (
        <>
          <h2 className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
            This week in the party
          </h2>
          <ul className="relative z-[1] m-0 flex list-none flex-col gap-1.5 p-0">
            {ranked.map((m) => (
              <li key={m.id} className="flex flex-col gap-1">
              <span className="flex items-center gap-2.5 text-[14.5px]" style={{ color: "var(--t-ink)" }}>
                <Link href={m.isYou ? "/" : `/friends/${m.id}`} className="w-[92px] shrink-0 truncate font-semibold underline-offset-2 hover:underline">
                  {m.isYou ? "You" : m.name}
                </Link>
                <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.14)" }}>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(4, (m.xp / top) * 100)}%`, background: "linear-gradient(90deg,#a88a3f,#f2d27e)" }} />
                </span>
                <span className="w-[64px] shrink-0 text-right font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
                  +{m.xp.toLocaleString("en-US")} XP
                </span>
                <span className="w-[54px] shrink-0 text-right text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }} title="Quests finished this week">
                  {m.quests} {m.quests === 1 ? "quest" : "quests"}
                </span>
                {view.streaks && (
                  <span className="flex w-[38px] shrink-0 items-center justify-end gap-0.5 text-[12.5px] tabular-nums" title={`${m.streak}-day quest streak`} style={{ color: "var(--t-ink-soft)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- painted flame */}
                    <img src="/design/ui-flame-sm.png" alt="" width={12} height={12} className="h-3 w-3" />
                    {m.streak}
                  </span>
                )}
                {m.isYou ? (
                  <span className="w-7 shrink-0" />
                ) : (
                  <button type="button" onClick={() => setAsking((a) => (a === m.id ? null : m.id))} aria-expanded={asking === m.id} aria-label={`Options for ${m.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>
                )}
              </span>
              {asking === m.id && (
                <span className="reveal flex flex-wrap items-center justify-end gap-2 text-[13px]" style={{ color: "var(--t-ink)" }}>
                  Remove {m.name} from your party?
                  <button type="button" disabled={pending} onClick={() => remove(m.id)} className="h-8 rounded-full px-3 font-semibold disabled:opacity-60" style={{ background: "#b5321f", color: "#fff" }}>
                    {pending ? "Removing…" : "Remove"}
                  </button>
                  <button type="button" onClick={() => setAsking(null)} className="h-8 px-1 underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                    Keep
                  </button>
                </span>
              )}
              </li>
            ))}
          </ul>
          {error && (
            <p className="relative z-[1] m-0 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </>
      )}
      {view.quiet && quiet.length > 0 && (
        <p className="relative z-[1] m-0 text-[14px]" style={{ color: "var(--t-ink)" }}>
          {quiet.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ", "}
              <Link href={`/friends/${m.id}`} className="font-semibold underline underline-offset-2">
                {m.name}
              </Link>
            </span>
          ))}{" "}
          {quiet.length === 1 ? "hasn't" : "haven't"} finished a quest in a few days. A cheer might help.
        </p>
      )}
      {view.week && members.length <= 1 && !quiet.length && (
        <p className="relative z-[1] m-0 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
          Invite someone and your party&apos;s week shows here.
        </p>
      )}
    </section>
  );
}

/** Settings: what the Guild Hall shows about your party. */
export function PartyViewSettings({ isAdventure }: { isAdventure: boolean }) {
  const view = usePartyView();
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 mb-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Choose what the Guild Hall shows, for cheering each other on and keeping each other going.
      </p>
      {PARTY_VIEW_OPTIONS.map((o) => {
        const on = view[o.key];
        return (
          <div key={o.key} className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
                {o.label}
              </span>
              <span className="block text-xs" style={{ color: "var(--t-ink-soft)" }}>
                {o.hint}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={o.label}
              onClick={() => setPartyView({ [o.key]: !on })}
              className="relative block h-7 w-12 shrink-0 rounded-full p-0"
              style={{ background: on ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "rgba(0,0,0,.18)", border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
            >
              <span className="absolute left-[2px] top-1/2 h-[22px] w-[22px] rounded-full bg-white shadow transition-transform duration-200" style={{ transform: `translate(${on ? 20 : 0}px, -50%)` }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
