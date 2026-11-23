// The server's wait per bottom-bar tab, measured without a browser (Run E, Nov 23: "tabs faster loads").
// Needs a build made against the UI check's fake database (`npm run ui-check` leaves one, or build with the env in
// scripts/ui-check/run.mjs). It puts a small proxy between the app and the fake database that holds every database
// request for --latency ms (default 40, about a Vercel-to-Supabase round trip), so the timings show how many database
// waits each page makes one after another, which the in-memory fake hides.
//   node scripts/perf/tab-waits.mjs [--latency 40] [--runs 5] [--only /,/calendar] [--log]
// For each route: the time to the first byte and to the end of a client navigation (RSC request, what a tap on the
// bottom bar fetches) and of a full page load, the median of --runs; the database requests it made; and, with --log,
// each request with when it started and ended, so the loaders that wait on each other show as steps.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
const R = new URL("../../", import.meta.url).pathname;
const require = createRequire(R + "package.json");
const { encode } = require("next-auth/jwt");
const { computeCacheBustingSearchParam } = require("next/dist/shared/lib/router/utils/cache-busting-search-param.js");
const { startFakeDb } = await import(R + "scripts/ui-check/fake-db.mjs");
const { makeFixtures, OWNER_ID } = await import(R + "scripts/ui-check/fixtures.mjs");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const LAT = Number(opt("latency", 40)), RUNS = Number(opt("runs", 5)), LOG = args.includes("--log");
const SECRET = "ui-check-secret-ui-check-secret-0123", DB = 54329, REAL_DB = 54339, APP = 3198;
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${DB}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "ui-check", SUPABASE_SERVICE_ROLE_KEY: "ui-check", AUTH_SECRET: SECRET, NEXTAUTH_SECRET: SECRET, AUTH_TRUST_HOST: "true", NEXT_TELEMETRY_DISABLED: "1", CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", RESEND_API_KEY: "", TZ: "UTC", APP_TIMEZONE: "America/New_York", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
const cookie = await encode({ token: { name: "T", email: "ui-check@example.com", picture: null, sub: OWNER_ID, googleSub: "x", profileId: OWNER_ID }, secret: SECRET, salt: "authjs.session-token" });
const db = await startFakeDb({ port: REAL_DB, fixtures: makeFixtures });

// The latency proxy: every request waits LAT ms, then goes to the fake database; each is logged.
let reqs = [];
let t0 = 0;
const proxy = http.createServer(async (req, res) => {
  const start = performance.now() - t0;
  let body = [];
  for await (const c of req) body.push(c);
  await new Promise((r) => setTimeout(r, LAT));
  const up = http.request({ host: "127.0.0.1", port: REAL_DB, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
    r.on("end", () => reqs.push({ start, end: performance.now() - t0, what: `${req.method} ${decodeURIComponent(req.url).replace(/\?.*select=/, " select=").slice(0, 110)}` }));
  });
  up.end(Buffer.concat(body));
});
await new Promise((r) => proxy.listen(DB, "127.0.0.1", r));

const srv = spawn("npx", ["next", "start", "-p", String(APP)], { cwd: R, env, stdio: "pipe", detached: true });
if (args.includes("--server-log")) {
  srv.stdout.pipe(process.stderr);
  srv.stderr.pipe(process.stderr);
}
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 300));
  try {
    if ((await fetch(`http://localhost:${APP}/api/auth/session`)).ok) break;
  } catch {}
}
const routes = (opt("only", "/,/calendar,/boards,/matrix,/insights,/feed")).split(",");
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function timed(route, rsc) {
  const headers = { cookie: `authjs.session-token=${cookie}` };
  let url = `http://localhost:${APP}${route}`;
  if (rsc) {
    // A tap from another tab: the router sends the tree it has, and `_rsc` must match it (Next 16 redirects otherwise).
    // From Today to any other tab; to Today from Friends.
    const from = route === "/" ? ["", { children: ["feed", { children: ["__PAGE__", {}] }] }] : ["", { children: ["__PAGE__", {}] }];
    const tree = encodeURIComponent(JSON.stringify(from));
    Object.assign(headers, { RSC: "1", "Next-Router-State-Tree": tree });
    url += `${route.includes("?") ? "&" : "?"}_rsc=${await computeCacheBustingSearchParam(undefined, undefined, tree, undefined)}`;
  }
  reqs = [];
  t0 = performance.now();
  const res = await fetch(url, { headers, redirect: "manual" });
  const ttfb = performance.now() - t0;
  // "Screen": when the app shell (drawn once the page's own data is in) reaches the browser; what streams after it
  // (the unread badge, the portrait painter) fills in behind Suspense.
  let body = "", screen = null;
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    body += dec.decode(chunk, { stream: true });
    if (screen === null && body.includes("data-app-shell")) screen = performance.now() - t0;
  }
  const total = performance.now() - t0;
  return { status: res.status, ttfb, screen: screen ?? total, total, kb: body.length / 1024, reqs: [...reqs].sort((a, b) => a.start - b.start) };
}
const out = [];
for (const r of routes) {
  await timed(r, false); // warm the route once
  const nav = [], full = [];
  let last;
  for (let i = 0; i < RUNS; i++) nav.push((last = await timed(r, true)));
  for (let i = 0; i < RUNS; i++) full.push(await timed(r, false));
  // "Waits": database requests that had to happen one after another. Requests that start within half a latency of
  // the first of a group ran side by side; one that starts later waited on something before it.
  let waves = 0, groupStart = -Infinity;
  for (const q of last.reqs) {
    if (q.start <= groupStart + LAT / 2) continue;
    waves++;
    groupStart = q.start;
  }
  const row = { route: r, status: last.status, navScreen: med(nav.map((x) => x.screen)), navTotal: med(nav.map((x) => x.total)), fullScreen: med(full.map((x) => x.screen)), fullTotal: med(full.map((x) => x.total)), dbRequests: last.reqs.length, waves };
  out.push(row);
  console.log(`${r.padEnd(10)} ${row.status}  tap: screen ${row.navScreen.toFixed(0).padStart(4)} ms, done ${row.navTotal.toFixed(0).padStart(4)} ms  ·  full load: screen ${row.fullScreen.toFixed(0).padStart(4)} ms, done ${row.fullTotal.toFixed(0).padStart(4)} ms  ·  ${row.dbRequests} db requests in ~${waves} waits`);
  if (LOG) for (const q of last.reqs) console.log(`   ${q.start.toFixed(0).padStart(5)}–${q.end.toFixed(0).padStart(5)}  ${q.what}`);
}
if (args.includes("--json")) console.log(JSON.stringify(out));
try {
  process.kill(-srv.pid, "SIGTERM");
} catch {}
proxy.close();
db.close();
process.exit(0);
