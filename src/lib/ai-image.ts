import "server-only";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/server";

// A saturated, "unlikely to appear in character art" chroma-key green —
// stripChromaBackground() below turns pixels near this color transparent
// once the image comes back, since the underlying model (Flux 1 Schnell)
// has no native transparent-background mode.
const CHROMA_KEY = { r: 57, g: 255, b: 20 }; // #39FF14
const CHROMA_KEY_HEX = "#39ff14";

/**
 * Prompt template shared by avatar and quest-icon generation: pushes toward
 * higher-detail "RPG concept art" character portraits (rather than a flat
 * game-icon look) and asks for a flat, solid chroma-key backdrop so
 * stripChromaBackground() has a clean color to key out.
 *
 * Deliberately weighted toward gritty/epic over cute/cartoonish — earlier
 * output was reading as too innocent and cartoony for a "dark fantasy
 * adventurer" tone, so the base template leans on weathered detail, harsh
 * lighting, and explicit "not cartoonish/cute/chibi" steering. Callers can
 * layer an additional mood on top via buildStyleSuffix (avatar-prompts.ts).
 */
export function buildAvatarPrompt(subject: string, opts: { withBackground?: boolean; look: string }) {
  const base =
    `${opts.look}, ${subject}, single character centered in frame, head and shoulders portrait, ` +
    "no other characters, no text, no watermark";

  return opts.withBackground
    ? `${base}, scenic fantasy background that matches the art style`
    : `${base}, flat solid ${CHROMA_KEY_HEX} green background with no gradient, no scenery, no vignette, no letters, no numbers, no writing of any kind`;
}

export function buildTaskIconPrompt(subject: string) {
  return (
    `single fantasy monster, ${subject}, hi-res RPG concept art, dramatic lighting, intricate detail, ` +
    `centered, no other creatures, flat solid ${CHROMA_KEY_HEX} green background with no gradient, no scenery, no letters or numbers, ` +
    "no text, no watermark"
  );
}

/**
 * AI-generated avatars/quest icons. "Generate once, then store it" — this
 * module is only ever called from a user-triggered server action, never on
 * page render, so a normal user's free Cloudflare Workers AI daily allowance
 * (10,000 Neurons/day as of writing) comfortably covers real usage.
 *
 * Cloudflare Workers AI text-to-image (Flux 1 Schnell — cheapest, fast,
 * good enough for small avatar-sized art). Returns base64 JPEG bytes
 * (verified against a live response — Cloudflare's own docs just say
 * "base64" without naming the format); see
 * https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
 */
async function generateImageBytes(prompt: string): Promise<Buffer> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error(
      "AI image generation isn't configured yet — set CLOUDFLARE_ACCOUNT_ID and " +
        "CLOUDFLARE_API_TOKEN in .env.local (free account at dash.cloudflare.com, " +
        "with a Workers AI-scoped API token)."
    );
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 8 }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cloudflare Workers AI request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  if (json?.success === false) {
    const msg = json?.errors?.[0]?.message ?? JSON.stringify(json?.errors ?? json);
    throw new Error(`Cloudflare Workers AI error: ${msg}`);
  }

  const base64 = json?.result?.image ?? json?.image;
  if (!base64 || typeof base64 !== "string") {
    throw new Error("Cloudflare Workers AI returned no image data.");
  }
  return Buffer.from(base64, "base64");
}

/**
 * A tiny deterministic hash — same input always produces the same output,
 * so the same prompt always renders the same fallback art (no randomness
 * to make re-generating pointless, no external dependency to fail).
 */
function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const FALLBACK_PALETTES: [string, string][] = [
  ["#6366f1", "#312e81"],
  ["#f59e0b", "#7c2d12"],
  ["#10b981", "#064e3b"],
  ["#ef4444", "#7f1d1d"],
  ["#8b5cf6", "#4c1d95"],
  ["#0ea5e9", "#0c4a6e"],
  ["#ec4899", "#831843"],
  ["#d1a13c", "#3b2a10"],
];

/**
 * Generates a simple, pleasant SVG "blob" portrait from the prompt text
 * alone — no network call, so it can never hit a quota or go down. Used as
 * the backup when Cloudflare Workers AI is unavailable (rate-limited,
 * misconfigured, or erroring) so avatar/icon generation always produces
 * *something* rather than a dead end.
 */
function generateFallbackSvg(prompt: string): string {
  const h = hashString(prompt || "quest");
  const [c1, c2] = FALLBACK_PALETTES[h % FALLBACK_PALETTES.length];
  const initials = (prompt || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
  // A handful of soft, randomly-placed (but seeded) blobs behind the
  // initials give some visual texture without needing real illustration.
  const blobs = Array.from({ length: 4 }, (_, i) => {
    const seed = h + i * 97;
    const cx = 20 + (seed % 60);
    const cy = 20 + ((seed >> 3) % 60);
    const r = 18 + ((seed >> 6) % 20);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 === 0 ? c1 : c2}" opacity="0.35" />`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)" />
  ${blobs}
  <text x="50" y="58" font-size="34" font-family="Georgia, serif" font-weight="700" fill="#ffffff" text-anchor="middle" opacity="0.92">${initials}</text>
</svg>`;
}

/**
 * Turns the chroma-key backdrop the prompt asked for into real alpha
 * transparency: any pixel close to CHROMA_KEY goes fully transparent, with
 * a feathered band just past that so the character's edge doesn't get a
 * hard, jagged cutout. Simple Euclidean color-distance keying — no ML
 * segmentation model involved, but effective against the flat, gradient-free
 * backdrop the prompt requests.
 */
async function stripChromaBackground(bytes: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const KEY_THRESHOLD = 55;
  const FEATHER_BAND = 45;

  for (let i = 0; i < data.length; i += channels) {
    const dr = data[i] - CHROMA_KEY.r;
    const dg = data[i + 1] - CHROMA_KEY.g;
    const db_ = data[i + 2] - CHROMA_KEY.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db_ * db_);
    if (dist < KEY_THRESHOLD) {
      data[i + 3] = 0;
    } else if (dist < KEY_THRESHOLD + FEATHER_BAND) {
      const t = (dist - KEY_THRESHOLD) / FEATHER_BAND;
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Generates one image from `prompt` and uploads it to the public `ai-images`
 * Supabase Storage bucket at `path` (e.g. "avatars/<profileId>-<ts>.png"),
 * returning its public URL. This is the "generate once, then store" step —
 * callers persist the returned URL and never call this again for the same
 * image.
 *
 * Falls back to a locally-generated SVG portrait (no network, no quota) if
 * Cloudflare Workers AI fails for any reason — a bad API key, an outage, or
 * (most commonly) the free plan's daily Neuron allowance running out.
 *
 * Pass `transparentBackground: true` (avatars and quest icons both do) to
 * key out the chroma-key backdrop the prompt asked for via
 * stripChromaBackground, so the stored image has a real transparent
 * background rather than a plain-colored square behind a circular crop.
 * Skipped for the local SVG fallback, which already has no flat photo
 * backdrop to key out.
 */
export async function generateAndStoreImage(
  prompt: string,
  path: string,
  opts: { transparentBackground?: boolean } = {}
): Promise<string> {
  let bytes: Buffer;
  let contentType = "image/jpeg";
  let finalPath = path;
  let isFallback = false;

  try {
    bytes = await generateImageBytes(prompt);
  } catch (err) {
    console.warn(
      "Cloudflare Workers AI image generation failed — using the local fallback generator instead:",
      err instanceof Error ? err.message : err
    );
    bytes = Buffer.from(generateFallbackSvg(prompt), "utf-8");
    contentType = "image/svg+xml";
    finalPath = path.replace(/\.[a-zA-Z0-9]+$/, ".svg");
    isFallback = true;
  }

  if (opts.transparentBackground && !isFallback) {
    try {
      bytes = await stripChromaBackground(bytes);
      contentType = "image/png";
      finalPath = finalPath.replace(/\.[a-zA-Z0-9]+$/, ".png");
    } catch (err) {
      console.warn(
        "Background removal failed — storing the image with its original background instead:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const db = supabaseAdmin();
  const { error: uploadError } = await db.storage
    .from("ai-images")
    .upload(finalPath, bytes, { contentType, upsert: true });
  if (uploadError) {
    throw new Error(`Failed to store generated image: ${uploadError.message}`);
  }

  const { data } = db.storage.from("ai-images").getPublicUrl(finalPath);
  return data.publicUrl;
}
