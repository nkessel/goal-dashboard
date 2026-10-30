"use client";

/*
 * Pictures for feedback upload in the background: a note can be sent while
 * its picture is still on the way, and the picture joins the saved note when
 * it lands. Each upload retries a few times; one that still fails waits with
 * a Retry (the picture is kept), so nothing is lost quietly.
 */

export type Upload = { id: string; draftId: string; state: "sending" | "failed"; retry: () => void; dismiss: () => void };

const uploads = new Map<string, Upload & { promise: Promise<string | null> }>();
const listeners = new Set<() => void>();
let snapshot: Upload[] = [];
function changed() {
  snapshot = [...uploads.values()].map(({ id, draftId, state, retry, dismiss }) => ({ id, draftId, state, retry, dismiss }));
  listeners.forEach((l) => l());
}
export const subscribeUploads = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const uploadsNow = () => snapshot;
const EMPTY: Upload[] = [];
export const uploadsServer = () => EMPTY;

async function sendOnce(make: () => Promise<File | Blob>): Promise<string> {
  const fd = new FormData();
  fd.append("file", await make());
  const r = await fetch("/api/feedback/image", { method: "POST", body: fd });
  const j = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
  if (!r.ok || !j.ok || !j.url) throw new Error(j.error ?? "Couldn't attach that image.");
  return j.url;
}

/** Notes already saved, waiting for their pictures: the picture is added when it lands. */
const savedAs = new Map<string, string>();
const landed = new Map<string, string[]>();

async function attachToSaved(draftId: string, url: string) {
  const entryId = savedAs.get(draftId);
  if (!entryId) return void landed.set(draftId, [...(landed.get(draftId) ?? []), url]);
  await fetch("/api/feedback/attach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entryId, url }) }).catch(() => {});
}

/**
 * Upload a picture for a draft. Resolves with its URL (or null if it failed
 * for now). If the note has been sent meanwhile, the picture joins it.
 */
export function uploadFor(draftId: string, make: () => Promise<File | Blob>): Promise<string | null> {
  const id = `${draftId}-${uploads.size}-${Math.round(performance.now())}`;
  const run = async (): Promise<string | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = await sendOnce(make);
        uploads.delete(id);
        changed();
        if (savedAs.has(draftId)) await attachToSaved(draftId, url);
        return url;
      } catch {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      }
    }
    const u = uploads.get(id);
    if (u) {
      u.state = "failed";
      changed();
    }
    return null;
  };
  const entry = {
    id,
    draftId,
    state: "sending" as const,
    promise: Promise.resolve<string | null>(null),
    retry: () => {
      const u = uploads.get(id);
      if (!u) return;
      u.state = "sending";
      u.promise = run();
      changed();
    },
    dismiss: () => {
      uploads.delete(id);
      changed();
    },
  };
  uploads.set(id, entry as Upload & { promise: Promise<string | null> });
  entry.promise = run();
  uploads.get(id)!.promise = entry.promise;
  changed();
  return entry.promise;
}

/** Still sending for this draft? */
export const sendingFor = (draftId: string) => [...uploads.values()].some((u) => u.draftId === draftId);

/** The note is saved: pictures still on the way will join it as they land. */
export function noteSaved(draftId: string, entryId: string) {
  savedAs.set(draftId, entryId);
  const early = landed.get(draftId) ?? [];
  landed.delete(draftId);
  for (const url of early) void attachToSaved(draftId, url);
}
