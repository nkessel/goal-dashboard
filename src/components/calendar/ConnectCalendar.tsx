import { connectGoogleCalendarAction } from "@/app/actions";

/**
 * Optional Google Calendar link. Nothing is asked of Google until the
 * person taps Connect; then Google shows its own permission screen.
 */
export function ConnectCalendar({ isAdventure, returnTo = "/calendar", compact = false }: { isAdventure: boolean; returnTo?: string; compact?: boolean }) {
  return (
    <form
      action={async () => {
        "use server";
        await connectGoogleCalendarAction(returnTo);
      }}
      className={compact ? "flex flex-col gap-2" : `flex flex-col items-start gap-2.5 rounded-2xl px-4 py-3.5 ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={compact || isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      {!compact && (
        <p className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
          Link your Google Calendar?
        </p>
      )}
      <p className="relative z-[1] m-0 text-[13.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        Optional. Your appointments show alongside your quests, open slots are suggested when you schedule one, and scheduled quests are added to
        your calendar. Google will ask you to allow it.
      </p>
      <button
        type="submit"
        className="hover-glow relative z-[1] h-10 rounded-full px-5 text-[14.5px] font-semibold"
        style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
      >
        Connect Google Calendar
      </button>
    </form>
  );
}
