/** Text with its web addresses as links (opened in a new tab; a tap on one doesn't open the card). */
export function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="underline underline-offset-2 [overflow-wrap:anywhere]" style={{ color: "inherit" }}>
            {p.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        ) : (
          p
        )
      )}
    </>
  );
}
