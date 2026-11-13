"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { messageThreadAction, sendMessageAction } from "@/app/actions";
import { Fold } from "@/components/ui/Fold";

type Friend = { id: string; name: string; unread: number };
type Msg = { id: string; from_id: string; body: string; created_at: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/**
 * Messages with your party (owner, Nov 13): pick a party member, the conversation opens right there,
 * write underneath. They're told in their notifications, and by email (the whole message) if they take emails.
 */
export function Messages({ friends, isAdventure }: { friends: Friend[]; isAdventure: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [read, setRead] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const shown = friends.find((f) => f.id === openId) ?? null;

  function open(id: string) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setMsgs(null);
    setError(null);
    setRead((r) => [...r, id]);
    messageThreadAction(id).then(
      (t) => (setMe(t.me), setMsgs(t.messages)),
      (e) => (setMsgs([]), setError(e instanceof Error ? e.message : "Couldn't load your messages."))
    );
  }
  // Arriving from a message's notification (/feed#messages), bring the section into view.
  useEffect(() => {
    if (window.location.hash === "#messages") document.getElementById("messages")?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  function send() {
    const body = text.trim();
    if (!body || !openId || pending) return;
    setError(null);
    startTransition(async () => {
      const out = await sendMessageAction(openId, body).catch(() => ({ ok: false as const, error: "Couldn't send that. Check your connection." }));
      if (!out.ok) return setError(out.error);
      setText("");
      setMsgs((m) => [...(m ?? []), out.message]);
    });
  }

  return (
    <section id="messages" className={`flex scroll-mt-4 flex-col gap-2 rounded-2xl px-4 py-3 ${isAdventure ? "parchment parchment-framed" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
      <h2 className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
        Messages
      </h2>
      {friends.length === 0 ? (
        <p className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          Invite someone to your party and you can write to each other here.
        </p>
      ) : (
        <div className="relative z-[1] flex flex-wrap gap-1.5">
          {friends.map((f) => {
            const unread = read.includes(f.id) ? 0 : f.unread;
            return (
              <button key={f.id} type="button" aria-expanded={openId === f.id} onClick={() => open(f.id)} data-message-friend className="qe-fact flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold" data-open={openId === f.id ? "true" : undefined}>
                <span aria-hidden>💬</span>
                {f.name}
                {unread > 0 && (
                  <span className="rounded-full px-1.5 text-[11px] font-bold leading-[16px]" style={{ background: "#b23a2a", color: "#fff" }} aria-label={`${unread} new`}>
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <Fold open={!!shown}>
        <div className="relative z-[1] flex flex-col gap-2 pt-1">
          <div className="flex max-h-[320px] min-h-[64px] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-xl p-2" style={{ background: "rgba(255,250,238,.5)", border: "1px solid rgba(139,112,64,.3)" }}>
            {msgs === null && (
              <span className="py-3 text-center text-[13px] italic" style={{ color: "var(--t-ink-soft)" }}>
                Opening your letters…
              </span>
            )}
            {msgs?.length === 0 && !error && (
              <span className="py-3 text-center text-[13px] italic" style={{ color: "var(--t-ink-soft)" }}>
                Nothing yet. Say hello to {shown?.name}.
              </span>
            )}
            {msgs?.map((m) => {
              const mine = m.from_id === me;
              return (
                <div key={m.id} className={`due-in flex max-w-[85%] flex-col ${mine ? "items-end self-end" : "items-start self-start"}`}>
                  <span data-selectable className="whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[14.5px] leading-snug" style={mine ? { background: "linear-gradient(180deg,#f2d58a,#e2c06c)", color: "#2a1c10", borderBottomRightRadius: 6 } : { background: "#fffaf0", border: "1px solid rgba(139,112,64,.35)", color: "#2a1c10", borderBottomLeftRadius: 6 }}>
                    {m.body}
                  </span>
                  <span className="px-1 text-[10.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    {when(m.created_at)}
                  </span>
                </div>
              );
            })}
            <div ref={end} />
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), send());
              }}
              rows={2}
              maxLength={4000}
              aria-label={shown ? `Message to ${shown.name}` : "Message"}
              placeholder={shown ? `Write to ${shown.name}…` : ""}
              className="min-h-[44px] flex-1 resize-none rounded-2xl px-3 py-2 text-[16px] leading-snug"
              style={{ background: "#fffaf0", border: "1px solid rgba(139,112,64,.45)", color: "#2a1c10" }}
            />
            <button type="button" onClick={send} disabled={pending || !text.trim()} className="h-11 shrink-0 rounded-full px-4 text-[14px] font-bold transition-opacity disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
          {error && (
            <p role="alert" className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>
      </Fold>
    </section>
  );
}
