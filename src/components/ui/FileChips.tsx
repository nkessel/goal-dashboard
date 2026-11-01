"use client";

import { fileLabel, fileUrl, type FileRef } from "@/lib/file-refs";

/** Files kept with a quest or card: a small parchment chip each, opening the file in a new tab. */
export function FileChips({ files, className = "" }: { files: FileRef[] | null | undefined; className?: string }) {
  if (!files?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {files.map((f) => (
        <a
          key={f.id}
          href={fileUrl(f)}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={`Open ${f.name}`}
          className="inline-flex max-w-[16rem] items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold no-underline"
          style={{ background: "rgba(201,162,74,.14)", border: "1px solid rgba(160,120,40,.45)", color: "#6b4c12" }}
        >
          <span aria-hidden>📎</span>
          <span className="truncate">{fileLabel(f)}</span>
        </a>
      ))}
    </div>
  );
}
