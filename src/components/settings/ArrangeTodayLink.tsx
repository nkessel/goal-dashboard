"use client";

import { useRouter } from "next/navigation";

/** Settings › Visual settings › Layout: arrange Today in place (its gear moved here, owner Nov 4). */
export function ArrangeTodayLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          window.sessionStorage.setItem("arrange-today", "1");
        } catch {
          /* storage unavailable */
        }
        if (window.location.pathname === "/") window.dispatchEvent(new Event("arrange-today"));
        router.push("/");
      }}
      className="mb-1 self-start text-[13.5px] font-semibold underline underline-offset-2"
      style={{ color: "var(--t-ink)" }}
    >
      Arrange Today ›
    </button>
  );
}
