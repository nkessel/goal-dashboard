import Link from "next/link";

/** On Today (and in Settings): things brought in, waiting to be sorted. One tap opens the cards. */
export function ImportsWaiting({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Link
      href="/import"
      className="hover-glow parchment flex items-center gap-3 rounded-2xl px-4 py-2.5"
      style={{ border: "1.5px solid #a88a3f", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", color: "#2a1c10", boxShadow: "0 0 0 2px rgba(242,210,126,.35), 0 4px 12px rgba(0,0,0,.2)" }}
    >
      <span aria-hidden className="text-[20px]">
        📜
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[16.5px] leading-tight">{count === 1 ? "Something to sort" : `${count} things to sort`}</span>
        <span className="text-[12.5px]" style={{ color: "#6b5631" }}>
          One card at a time: import, snooze or skip
        </span>
      </span>
      <span aria-hidden className="text-[20px]" style={{ color: "#8a6116" }}>
        ›
      </span>
    </Link>
  );
}
