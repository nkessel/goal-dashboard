/** A private file kept with a quest or an import card (bytes in `attachments`, served at /api/attachments/<id>). */
export type FileRef = { id: string; name: string; size?: number };

export function cleanFileRefs(v: unknown): FileRef[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is FileRef => !!x && typeof x === "object" && typeof (x as FileRef).id === "string" && typeof (x as FileRef).name === "string")
    .map((x) => ({ id: x.id, name: x.name, size: typeof x.size === "number" ? x.size : undefined }))
    .slice(0, 12);
}

export const fileUrl = (f: FileRef) => `/api/attachments/${f.id}`;

/** "MA claim form.pdf" → "MA claim form" (short labels on chips). */
export const fileLabel = (f: FileRef) => f.name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ");
