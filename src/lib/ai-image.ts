import "server-only";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/server";

// A saturated, "unlikely to appear in character art" chroma-key green —
// stripChromaBackground() below turns pixels near this color transparent
// once the image comes back, since the underlying model (Flux 1 Schnell)
// has no native transparent-background mode.
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

/** Imported quests/rewards: colored-pencil sketchbook illustration, like the
 * hand-drawn art in classic children's fantasy novels. */
export function buildSketchbookIconPrompt(subject: string) {
  return (
    `whimsical painted storybook illustration of ${subject}, soft chalk pastel and gouache painting ` +
    "in the style of late-1990s illustrated children's fantasy novel chapter art, warm glowing golden candlelight, " +
    "rich saturated jewel tones, deep ambers and teals, soft blended edges, visible pastel grain and brush texture, " +
    "magical cozy enchanted atmosphere, gentle painterly highlights, single small centered object, " +
    "the whole object fully visible with a wide empty margin on every side, nothing touching the edges, " +
    "isolated on a plain flat bright green background, no table, no shadow, no scenery, " +
    "absolutely no text, no words, no writing, no labels, no captions, no signature, no letters or numbers"
  );
}

/** Quest portraits: the same painted storybook style, with a softly painted
 * scene behind the subject (kept, not keyed out). */
export function buildQuestScenePrompt(subject: string) {
  return (
    `whimsical painted storybook illustration of ${subject}, soft chalk pastel and gouache painting ` +
    "in the style of late-1990s illustrated children's fantasy novel chapter art, warm glowing golden candlelight, " +
    "rich saturated jewel tones, deep ambers and teals, soft blended edges, visible pastel grain and brush texture, " +
    "magical cozy enchanted atmosphere, the subject centered and clearly readable, " +
    "set in a softly painted matching scene that fills the whole frame, gentle vignette, " +
    "absolutely no text, no words, no writing, no labels, no captions, no signature, no letters or numbers"
  );
}

/** Rewards: the same painted storybook style, but the treasure keeps a
 * beaming background — golden rays and a glowing halo behind it, like a
 * found jewel or an opened chest. Not keyed out. */
export function buildTreasureIconPrompt(subject: string) {
  return (
    `enchanted treasure illustration of ${subject}, soft chalk pastel and gouache painting ` +
    "in the style of late-1990s illustrated children's fantasy novel chapter art, the object glowing at the center, " +
    "radiant beams of warm golden light bursting outward behind it in a starburst, luminous halo, drifting magical sparkles, " +
    "background fading from bright gold at the center to deep teal and midnight blue at the edges, rich jewel tones, " +
    "soft blended edges, visible pastel grain and brush texture, single centered object, " +
    "absolutely no text, no words, no writing, no labels, no captions, no signature, no letters or numbers"
  );
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
 * transparency: the flat backdrop connected to the image border goes fully transparent, with
 * a feathered band just past that so the character's edge doesn't get a
 * hard, jagged cutout. Simple Euclidean color-distance keying — no ML
 * segmentation model involved, but effective against the flat, gradient-free
 * backdrop the prompt requests.
 */
async function stripChromaBackground(bytes: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const KEY_THRESHOLD = 70;
  const FEATHER_BAND = 45;

  // The model rarely paints the exact key color, so key out whatever flat
  // color actually fills the border (median of the edge pixels)...
  const edge: number[][] = [];
  const px = (x: number, y: number) => (y * width + x) * channels;
  for (let x = 0; x < width; x += 4) {
    edge.push([...data.subarray(px(x, 0), px(x, 0) + 3)], [...data.subarray(px(x, height - 1), px(x, height - 1) + 3)]);
  }
  for (let y = 0; y < height; y += 4) {
    edge.push([...data.subarray(px(0, y), px(0, y) + 3)], [...data.subarray(px(width - 1, y), px(width - 1, y) + 3)]);
  }
  const median = (k: number) => edge.map((c) => c[k]).sort((m, n) => m - n)[Math.floor(edge.length / 2)];
  const key = { r: median(0), g: median(1), b: median(2) };
  const distAt = (i: number) => {
    const dr = data[i] - key.r;
    const dg = data[i + 1] - key.g;
    const db_ = data[i + 2] - key.b;
    return Math.sqrt(dr * dr + dg * dg + db_ * db_);
  };

  // ...and only where it's connected to the border (flood fill), so the
  // same color inside the character — a green cloak — is kept.
  const removed = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const p = y * width + x;
    if (!removed[p] && distAt(p * channels) < KEY_THRESHOLD) {
      removed[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }

  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    if (removed[p]) {
      data[i + 3] = 0;
      continue;
    }
    // Soften the fringe right next to the removed area.
    const x = p % width;
    const y = (p - x) / width;
    const touches =
      (x > 0 && removed[p - 1]) ||
      (x < width - 1 && removed[p + 1]) ||
      (y > 0 && removed[p - width]) ||
      (y < height - 1 && removed[p + width]);
    if (touches) {
      const d = distAt(i);
      if (d < KEY_THRESHOLD + FEATHER_BAND) {
        data[i + 3] = Math.round(data[i + 3] * ((d - KEY_THRESHOLD) / FEATHER_BAND + 0.35));
      }
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
  opts: { transparentBackground?: boolean; pixelate?: number } = {}
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

  // Pixel style: snap to a real low-res pixel grid, then scale back up with
  // hard edges, so every pixel is a visible square.
  if (opts.pixelate && !isFallback) {
    try {
      const grid = opts.pixelate;
      const small = await sharp(bytes).resize(grid, grid, { kernel: "nearest", fit: "cover" }).png().toBuffer();
      bytes = await sharp(small).resize(512, 512, { kernel: "nearest" }).png().toBuffer();
      contentType = "image/png";
      finalPath = finalPath.replace(/\.[a-zA-Z0-9]+$/, ".png");
    } catch (err) {
      console.warn("Pixelation failed — storing the unpixelated image:", err instanceof Error ? err.message : err);
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

/**
 * Turns a quest's own words ("Session 3 reading · Ch 10 + Appendices") into
 * one concrete thing to paint ("an open book with bookmarks and a lit
 * candle"), using a small Workers AI text model. Painting the raw title
 * often gives art that has little to do with the quest; this step keeps the
 * picture about the task. Falls back to the original text on any failure.
 */
export async function visualSubjectFor(text: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const raw = text.trim().slice(0, 600);
  if (!accountId || !apiToken || !raw) return raw;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct-fast`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        max_tokens: 48,
        messages: [
          {
            role: "system",
            content:
              "You pick the picture for a small icon of a to-do item. Reply with ONE concrete, easily drawn object or tiny scene " +
              "that someone would instantly connect to the task (e.g. 'Sign up for personal training' -> 'a pair of dumbbells and a clipboard'; " +
              "'Call Martin' -> 'an old telephone handset with a heart'). Under 15 words. Nouns and simple details only. " +
              "No style words, no people's names, no text or lettering, no quotes.",
          },
          { role: "user", content: raw },
        ],
      }),
    });
    if (!res.ok) return raw;
    const json = await res.json();
    const out = String(json?.result?.response ?? "").trim().replace(/^["'\s]+|["'.\s]+$/g, "");
    return out && out.length < 160 ? out : raw;
  } catch {
    return raw;
  }
}
