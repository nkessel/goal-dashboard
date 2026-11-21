"use client";

/**
 * The toucan's words, easy to take in at a glance: a list becomes bullets
 * (each its own line), quest titles in quotes stand out, and a long paragraph
 * is split at its sentences, one short line each.
 */
export function Digest({ text }: { text: string }) {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: { kind: "p" | "li"; text: string }[] = [];
  for (const l of lines) {
    const b = l.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (b) items.push({ kind: "li", text: b[1] });
    // A long paragraph: its sentences become short lines.
    else if (l.length > 140) for (const sent of l.match(/[^.!?]+[.!?]+["”’)]?|[^.!?]+$/g) ?? [l]) items.push({ kind: "p", text: sent.trim() });
    else items.push({ kind: "p", text: l });
  }
  const mark = (t: string) =>
    t.split(/("[^"]+"|“[^”]+”)/g).map((part, i) =>
      /^["“]/.test(part) ? (
        <b key={i} className="font-semibold" style={{ color: "#f2d27e" }}>
          {part.replace(/^["“]|["”]$/g, "")}
        </b>
      ) : (
        part
      )
    );
  return (
    <span className="flex flex-col gap-1 whitespace-normal">
      {items.map((it, i) =>
        it.kind === "li" ? (
          <span key={i} className="flex gap-1.5">
            <span aria-hidden style={{ color: "rgba(140,240,220,.85)" }}>
              ✦
            </span>
            <span>{mark(it.text)}</span>
          </span>
        ) : (
          <span key={i}>{mark(it.text)}</span>
        )
      )}
    </span>
  );
}
