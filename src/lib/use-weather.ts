"use client";

import { useEffect, useState } from "react";

export const WEATHER_KEY = "weather-coords";
export const WEATHER_EVENT = "weather-coords";

export type HourWeather = { temp: number; rain: number };
/** dayKey (YYYY-MM-DD) → hour (0–23) → forecast. */
export type WeatherByDay = Record<string, Record<number, HourWeather>>;

function prefersFahrenheit() {
  return (
    /^en-US/.test(navigator.language) ||
    /^(America\/(?!Sao|Argentina|Bogota|Lima|Santiago|Caracas|Mexico)|US\/)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone)
  );
}

/** Ask the browser for a rough location (rounded to ~1 km) for forecasts. */
export function askForWeatherLocation(onError?: (msg: string) => void) {
  if (!navigator.geolocation) return onError?.("This browser can't share a location.");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      try {
        window.localStorage.setItem(WEATHER_KEY, JSON.stringify({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }));
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new Event(WEATHER_EVENT));
    },
    () => onError?.("Couldn't get your location for the forecast."),
    { maximumAge: 86_400_000, timeout: 10_000 }
  );
}

/**
 * Hourly forecast (temperature, chance of rain) from Open-Meteo for a run of
 * days, once a location has been shared. undefined = location not shared
 * yet; null = loading or unavailable.
 */
export function useWeatherRange(startKey: string | null, endKey: string | null): WeatherByDay | null | undefined {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null | undefined>(undefined);
  const [data, setData] = useState<{ key: string; days: WeatherByDay } | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(WEATHER_KEY);
        setCoords(raw ? (JSON.parse(raw) as { lat: number; lon: number }) : undefined);
      } catch {
        setCoords(undefined);
      }
    };
    read();
    window.addEventListener(WEATHER_EVENT, read);
    return () => window.removeEventListener(WEATHER_EVENT, read);
  }, []);
  const reqKey = coords && startKey && endKey ? `${coords.lat},${coords.lon},${startKey},${endKey}` : null;
  useEffect(() => {
    if (!coords || !startKey || !endKey || !reqKey) return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,precipitation_probability&timezone=auto&start_date=${startKey}&end_date=${endKey}${prefersFahrenheit() ? "&temperature_unit=fahrenheit" : ""}`;
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((j: { hourly?: { time: string[]; temperature_2m: (number | null)[]; precipitation_probability: (number | null)[] } }) => {
        if (!alive || !j.hourly) return;
        const days: WeatherByDay = {};
        j.hourly.time.forEach((t, i) => {
          const temp = j.hourly!.temperature_2m[i];
          if (temp === null || temp === undefined) return;
          const day = t.slice(0, 10);
          (days[day] ??= {})[Number(t.slice(11, 13))] = { temp: Math.round(temp), rain: Math.round(j.hourly!.precipitation_probability[i] ?? 0) };
        });
        setData({ key: reqKey, days });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [coords, startKey, endKey, reqKey]);
  if (coords === undefined) return undefined;
  return data && data.key === reqKey ? data.days : null;
}

/** A day's high, low and the highest chance of rain while you're up (7am–10pm). */
export function daySummary(hours: Record<number, HourWeather> | undefined) {
  if (!hours) return null;
  const vals = Object.entries(hours).map(([h, w]) => ({ h: Number(h), ...w }));
  if (vals.length === 0) return null;
  const awake = vals.filter((v) => v.h >= 7 && v.h <= 22);
  return {
    hi: Math.max(...vals.map((v) => v.temp)),
    lo: Math.min(...vals.map((v) => v.temp)),
    rain: Math.max(0, ...(awake.length ? awake : vals).map((v) => v.rain)),
  };
}
