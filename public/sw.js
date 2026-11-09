/*
 * Goal Dashboard offline helper (owner, Nov 6: "make the inventory, the packing lists, and anything
 * else available offline").
 *
 * - Screens you're signed in to are kept on the device as you visit them (and a few main ones are
 *   fetched quietly in the background), so the app opens without a connection. Online, the network
 *   always wins; the copy is only used when it can't be reached.
 * - The app's code, styles and fonts are kept once loaded (their names change with every deploy).
 * - Pictures (portraits) are kept too, up to a limit.
 * Changes made offline are queued by the page itself (src/lib/offline.ts), not here.
 */
const PAGES = "gd-pages-v1";
const ASSETS = "gd-assets-v1";
// v2: v1 could hold a failed picture kept as an opaque response (it looked fine but never showed).
const IMAGES = "gd-images-v2";
const KEEP = [PAGES, ASSETS, IMAGES];
const MAX_ASSETS = 500;
const MAX_IMAGES = 160;
const MAX_PAGES = 60;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("gd-") && !KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Only a signed-in app screen is kept (never the sign-in page, never someone else's error page). */
async function keepPage(url, res) {
  if (!res || !res.ok || res.redirected || res.type !== "basic") return;
  if (!(res.headers.get("content-type") || "").includes("text/html")) return;
  const html = await res.clone().text();
  const cache = await caches.open(PAGES);
  if (!html.includes("data-app-shell")) {
    // Signed out on this device: forget the screens kept for the last person.
    if (/sign in|sign-in|signin/i.test(html) && new URL(url).pathname === "/") await caches.delete(PAGES);
    return;
  }
  await cache.put(url, res.clone());
  trim(PAGES, MAX_PAGES);
  // Keep the code that screen needs, so it runs offline even if it was never opened before.
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  const assetCache = await caches.open(ASSETS);
  for (const a of new Set(assets)) {
    if (await assetCache.match(a, { ignoreVary: true })) continue;
    try {
      const r = await fetch(a);
      if (r.ok) await assetCache.put(a, r);
    } catch {
      /* next time */
    }
  }
}

function offlinePage(cached) {
  const names = { "/": "Today", "/settings/inventory": "Inventory", "/boards": "Boards", "/settings": "Settings", "/calendar": "Calendar", "/insights": "Insights", "/journal": "Journal", "/rewards": "Treasure Chest" };
  const links = cached
    .map((u) => new URL(u).pathname)
    .filter((p, i, a) => a.indexOf(p) === i && names[p])
    .map((p) => `<a href="${p}">${names[p]}</a>`)
    .join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Goal Dashboard</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1f3a2b;font-family:Georgia,serif;color:#2a1c10}
.card{max-width:340px;margin:16px;padding:22px;border-radius:18px;background:linear-gradient(180deg,#fbf3df,#f1e3c0);border:1.5px solid #a88a3f;box-shadow:0 12px 36px rgba(0,0,0,.4)}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#6b5631;font-size:15px;line-height:1.4}
a{display:inline-block;margin:0 6px 8px 0;padding:6px 12px;border-radius:999px;border:1px solid rgba(139,112,64,.45);background:rgba(255,250,238,.55);color:#2a1c10;text-decoration:none;font-size:14px}</style></head>
<body><div class="card"><h1>☁ You're offline</h1><p>This screen wasn't kept on this device yet.${links ? " These are:" : " Open the app once with a connection and its main screens will be kept."}</p>${links}</div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

async function fromNetworkFirst(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    event.waitUntil(keepPage(req.url, res.clone()).catch(() => {}));
    return res;
  } catch {
    const cache = await caches.open(PAGES);
    const hit = (await cache.match(req.url, { ignoreVary: true })) || (await cache.match(req.url, { ignoreSearch: true, ignoreVary: true }));
    if (hit) return hit;
    const path = new URL(req.url).pathname;
    if (path === "/") {
      // "/" opens your last screen: offer whichever screen is kept.
      for (const p of ["/", "/settings/inventory", "/boards", "/settings", "/insights"]) {
        const any = await cache.match(new URL(p, req.url).href, { ignoreVary: true });
        if (any) return any;
      }
    }
    return offlinePage((await cache.keys()).map((r) => r.url));
  }
}

async function cacheFirst(name, req, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await cache.put(req, res.clone());
    if (max) trim(name, max);
  }
  return res;
}

async function staleWhileRevalidate(name, req, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  // A picture from another site (Supabase storage) is asked for again in "cors" mode so its status can be read and a failed one is never kept.
  const ask = new URL(req.url).origin === self.location.origin ? fetch(req) : fetch(req.url, { mode: "cors", credentials: "omit" }).catch(() => fetch(req));
  const fresh = ask
    .then(async (res) => {
      // Only a picture the server really answered with is kept (an opaque reply can't be checked, so it could be an error).
      if (res.ok && res.type !== "opaque") {
        await cache.put(req, res.clone());
        trim(name, max);
      }
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && (url.pathname.startsWith("/api/") || url.pathname === "/sw.js")) return;

  if (req.mode === "navigate" && same) {
    event.respondWith(fromNetworkFirst(event));
    return;
  }
  if (same && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(ASSETS, req, MAX_ASSETS));
    return;
  }
  if (req.destination === "image" && (same || url.protocol === "https:")) {
    event.respondWith(staleWhileRevalidate(IMAGES, req, MAX_IMAGES));
    return;
  }
  if (same && req.destination === "font") {
    event.respondWith(cacheFirst(ASSETS, req, MAX_ASSETS));
  }
});

/** The page asks for its main screens to be kept (once in a while, when online). */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.paths)) {
    event.waitUntil(
      (async () => {
        for (const p of data.paths) {
          try {
            const url = new URL(p, self.location.origin).href;
            const res = await fetch(url, { credentials: "same-origin" });
            await keepPage(url, res);
          } catch {
            /* offline again */
          }
        }
      })()
    );
  }
  if (data.type === "forget") event.waitUntil(caches.delete(PAGES));
});
