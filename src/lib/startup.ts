"use client";

import { startupAction } from "@/app/actions";

type Startup = Awaited<ReturnType<typeof startupAction>>;
type Value<K extends keyof Startup> = Extract<Startup[K], { ok: true }>["value"];

let batch: Promise<Startup | null> | null = null;
const used = new Set<keyof Startup>();

/**
 * The first read of each part on a page load comes from one shared request (`startupAction`), so
 * opening the app sends one server action instead of seven (they run one at a time). Any later
 * read, or a part that failed there, calls its own action (`direct`).
 */
export function fromStartup<K extends keyof Startup>(key: K, direct: () => Promise<Value<K>>): Promise<Value<K>> {
  if (used.has(key)) return direct();
  used.add(key);
  batch ??= startupAction().catch(() => null);
  return batch.then((b) => {
    const part = b?.[key];
    return part?.ok ? (part.value as Value<K>) : direct();
  });
}
