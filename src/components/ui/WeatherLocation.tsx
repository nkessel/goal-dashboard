"use client";

import { useEffect, useRef, useState } from "react";
import { WEATHER_EVENT, WEATHER_KEY } from "@/lib/use-weather";
import { saveWeatherPlaceAction } from "@/app/actions";

type Place = { name: string; region: string; lat: number; lon: number };

function save(p: { lat: number; lon: number; name?: string }) {
  const place = { lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100, name: p.name ?? null };
  try {
    window.localStorage.setItem(WEATHER_KEY, JSON.stringify(place));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(WEATHER_EVENT));
  // Kept on your account too, so every device uses the same place until you change it.
  void saveWeatherPlaceAction(place).catch(() => {});
}

/** The saved forecast place's name, if any. */
export function useWeatherPlaceName(): string | null | undefined {
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(WEATHER_KEY);
        setName(raw ? ((JSON.parse(raw) as { name?: string | null }).name ?? "your location") : null);
      } catch {
        setName(null);
      }
    };
    read();
    window.addEventListener(WEATHER_EVENT, read);
    return () => window.removeEventListener(WEATHER_EVENT, read);
  }, []);
  return name;
}

/**
 * "Show weather": use this device's location, or type a city or ZIP code
 * (for browsers that don't share a location). The place is kept on your account.
 */
export function WeatherLocation({ dark = false, label = "Show weather", up = false }: { dark?: boolean; label?: string; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const ink = dark ? "#f1ead2" : "var(--t-ink)";
  const soft = dark ? "#b9b3c9" : "var(--t-ink-soft)";

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  function useDevice() {
    setNote(null);
    if (!navigator.geolocation) return setNote("This browser can't share a location — type a city or ZIP instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        save({ lat: p.coords.latitude, lon: p.coords.longitude, name: "your location" });
        setOpen(false);
      },
      (e) => {
        setBusy(false);
        setNote(e.code === 1 ? "Location sharing is blocked in this browser — type a city or ZIP instead." : "Couldn't find your location — type a city or ZIP instead.");
      },
      { maximumAge: 86_400_000, timeout: 10_000 }
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setNote(null);
    try {
      const zip = /^\d{5}$/.test(term);
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=5${zip ? "&countryCode=US" : ""}`);
      const j = (await r.json()) as { results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }[] };
      const list = (j.results ?? []).map((x) => ({ name: x.name, region: [x.admin1, x.country_code].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
      setResults(list);
      if (list.length === 0) setNote("No place by that name — try a nearby city.");
    } catch {
      setNote("Couldn't look that up just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={box} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="underline underline-offset-2" style={{ color: ink }}>
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Where should the forecast be for?"
          className={`pop absolute z-[40] flex ${up ? "bottom-full right-0 mb-1.5" : "left-0 top-full mt-1.5"} w-[min(290px,calc(100vw-32px))] flex-col gap-2 p-3 ${dark ? "" : "parchment"}`}
          style={{
            borderRadius: 12,
            boxShadow: "0 12px 28px rgba(0,0,0,.35)",
            ...(dark ? { background: "#1b1d36", border: "1px solid rgba(217,180,95,.35)" } : { border: "1px solid #b39a6a" }),
          }}
        >
          <button
            type="button"
            onClick={useDevice}
            disabled={busy}
            className="relative z-[1] flex h-10 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold disabled:opacity-60"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
          >
            📍 Use this device&rsquo;s location
          </button>
          <form onSubmit={search} className="relative z-[1] flex gap-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="or a city or ZIP"
              aria-label="City or ZIP code"
              className="h-10 min-w-0 flex-1 rounded-lg border px-2.5 text-[15px]"
              style={dark ? { background: "rgba(255,255,255,.06)", borderColor: "rgba(217,180,95,.35)", color: ink } : { background: "rgba(255,255,255,.55)", borderColor: "#b39a6a", color: ink }}
            />
            <button type="submit" disabled={busy} className="h-10 shrink-0 rounded-lg px-3 text-[14px] font-semibold disabled:opacity-60" style={{ border: `1px solid ${dark ? "rgba(217,180,95,.45)" : "#b39a6a"}`, color: ink }}>
              Find
            </button>
          </form>
          {note && (
            <p className="relative z-[1] m-0 text-[13px]" style={{ color: soft }}>
              {note}
            </p>
          )}
          {results && results.length > 0 && (
            <ul className="relative z-[1] m-0 flex list-none flex-col p-0">
              {results.map((p) => (
                <li key={`${p.lat},${p.lon}`}>
                  <button
                    type="button"
                    onClick={() => {
                      save({ lat: p.lat, lon: p.lon, name: p.name });
                      setOpen(false);
                    }}
                    className="min-h-10 w-full rounded-lg px-2 text-left text-[14.5px] hover:bg-black/[.08]"
                    style={{ color: ink }}
                  >
                    {p.name} <span style={{ color: soft }}>{p.region}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
