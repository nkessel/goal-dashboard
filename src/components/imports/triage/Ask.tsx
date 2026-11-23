"use client";

import { chip } from "./types";

export function Question({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="m-0 font-display text-[20px]">{children}</h3>
      {hint && (
        <span className="text-[13px]" style={{ color: "#6b5631" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Choices({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function Choice({ on, onClick, children, note }: { on: boolean; onClick: () => void; children: React.ReactNode; note?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex items-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold" style={chip(on, true)}>
      {children}
      {note && (
        <span className="text-[11.5px] font-normal italic" style={{ color: "#7a6440" }}>
          {note}
        </span>
      )}
    </button>
  );
}
