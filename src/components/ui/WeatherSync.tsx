"use client";

import { useEffect } from "react";
import { WEATHER_EVENT, WEATHER_KEY } from "@/lib/use-weather";
import { saveWeatherPlaceAction } from "@/app/actions";

/**
 * The forecast place is kept on your account: a device that hasn't got one
 * yet (or lost it) picks it up, so the place only changes when you change it.
 */
export function WeatherSync({ place }: { place: { lat: number; lon: number; name?: string | null } | null }) {
  useEffect(() => {
    if (!place) {
      // The account has none yet: this device's place becomes the account's.
      try {
        const raw = window.localStorage.getItem(WEATHER_KEY);
        if (raw) void saveWeatherPlaceAction(JSON.parse(raw)).catch(() => {});
      } catch {
        /* storage unavailable */
      }
      return;
    }
    try {
      // Only fills a device that has no place; a change made here goes up to the account.
      if (window.localStorage.getItem(WEATHER_KEY)) return;
      window.localStorage.setItem(WEATHER_KEY, JSON.stringify(place));
      window.dispatchEvent(new Event(WEATHER_EVENT));
    } catch {
      /* storage unavailable */
    }
  }, [place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps -- the place itself, not the object
  return null;
}
