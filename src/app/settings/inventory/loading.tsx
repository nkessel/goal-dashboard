/** Shown the moment Inventory is tapped (and prefetched), so there's no blank screen while the pack loads. */
export default function InventoryLoading() {
  return (
    <div className="fixed inset-0 z-[1] flex items-start justify-center px-4 pt-[max(76px,env(safe-area-inset-top))]" style={{ background: "linear-gradient(180deg, #2c3324, #1b2119)" }} aria-busy aria-label="Opening your backpack">
      <div className="flex w-full max-w-[460px] flex-col gap-4">
        <div className="h-10 w-40 rounded-full" style={{ background: "rgba(10,12,32,.45)", border: "1.5px solid rgba(217,180,95,.3)" }} />
        <div className="inv-loading backpack" style={{ minHeight: 420 }}>
          <div className="backpack-pocket backpack-flap" style={{ minHeight: 110 }} />
          <div className="backpack-pocket backpack-main" style={{ minHeight: 230 }} />
        </div>
      </div>
    </div>
  );
}
