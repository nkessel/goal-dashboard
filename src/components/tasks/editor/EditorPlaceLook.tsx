"use client";

import { saveQuestPlace, useQuestPlace } from "@/lib/use-quest-places";
import { driveWords, useQuestDrive } from "@/lib/use-quest-cal";
import { DrivePicks } from "../DrivePicks";
import { CloseIcon } from "@/components/ui/Icons";
import { PinGlyph } from "./glyphs";

/** Where it happens: an icon-only pill, last in the quick-details row (owner, Nov 3); shown on the card too. The place and the drive times live in shared stores keyed by the quest's id; which pill is open stays with the dialog. */
export function PlacePill({ taskId, open, onToggle }: { taskId: string; open: boolean; onToggle: () => void }) {
  const place = useQuestPlace(taskId);
  const drive = useQuestDrive(taskId);
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={place ? `Location: ${place}` : "Add a location"} title={place ? `📍 ${place}` : "Where it happens"} className="qe-fact flex h-9 items-center gap-1 rounded-full px-2.5 text-[13.5px] font-semibold" data-open={open ? "true" : undefined}>
      <PinGlyph />
      {/* Says what it is when empty (owner, Nov 20: "have this say location"). */}
      <span className="max-w-[110px] truncate">{place || "Location"}</span>
      {drive && <span className="shrink-0 whitespace-nowrap" style={{ opacity: 0.8 }}>· 🚗 {driveWords(drive)}</span>}
    </button>
  );
}

/** The place pill's panel: the place field and the drive-time picks. */
export function PlacePanel({ taskId, onClose, fieldStyle }: { taskId: string; onClose: () => void; fieldStyle: React.CSSProperties }) {
  const place = useQuestPlace(taskId);
  return (
    <div data-pill-tray className="reveal qe-fact-panel pill-tray-box flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <PinGlyph />
        <input
          autoFocus
          defaultValue={place ?? ""}
          placeholder="Where? (e.g. Natick library)"
          aria-label="Where it happens"
          onBlur={(e) => void saveQuestPlace(taskId, e.target.value).catch(() => {})}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLInputElement).blur(), onClose())}
          className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[16px]"
          style={fieldStyle}
        />
        {place && (
          <button type="button" onClick={() => (void saveQuestPlace(taskId, null).catch(() => {}), onClose())} aria-label="No place" className="h-9 w-7 shrink-0 text-[18px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={11} />
          </button>
        )}
      </div>
      {/* Driving there and back (owner, Nov 12: "the option for driving time is crucial"): kept free on the calendar. */}
      <DrivePicks taskId={taskId} />
    </div>
  );
}
