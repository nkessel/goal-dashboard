import Link from "next/link";
import type { Inventory } from "@/lib/inventory";
import { BackpackIcon } from "./BackpackIcon";

/**
 * Beside your portrait on Today when something in the backpack has run out:
 * a small pack with a red count. Tapping it opens the inventory straight away
 * (owner, Nov 23: "Clicking on bag in main screen goes straight to the inventory").
 */
export function RefillBadge({ inventory }: { inventory: Inventory }) {
  const count = inventory.items.filter((i) => i.status === "empty").length;
  if (!count) return null;
  return (
    <div className="absolute -right-2 bottom-2 z-[5] sm:-right-1.5 sm:bottom-3">
      <Link
        href="/settings/inventory"
        aria-label={`${count} ${count === 1 ? "item needs" : "items need"} refilling: open the inventory`}
        className="card-pop-in relative flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))" }}
      >
        <BackpackIcon size={30} />
        <span className="absolute -right-1.5 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[10px] font-bold leading-none tabular-nums" style={{ background: "#d23a2a", color: "#fff", boxShadow: "0 0 0 1.5px #2a1c10" }}>
          {count}
        </span>
      </Link>
    </div>
  );
}
