import { ImageResponse } from "next/og";

/** The Home Screen icon: a gilded compass star on forest green (no secrets, drawn, cached). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Math.max(64, Math.min(1024, Number(raw) || 512));
  const s = size;
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 40%, #2f4a35, #14231a 70%)" }}>
        <svg width={s * 0.7} height={s * 0.7} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#d9b45f" strokeWidth="4" />
          <path d="M50 8 L58 42 L92 50 L58 58 L50 92 L42 58 L8 50 L42 42 Z" fill="#e8c873" stroke="#8a6116" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="6" fill="#14231a" />
        </svg>
      </div>
    ),
    { width: s, height: s, headers: { "Cache-Control": "public, max-age=604800, immutable" } }
  );
}
