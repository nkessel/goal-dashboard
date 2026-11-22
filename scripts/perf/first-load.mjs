// First Load JS per route (gzip), from the script tags of the server-drawn page. Needs a build made against the UI check's fake database
//   (`npm run ui-check` leaves one, or run it with the same env as scripts/ui-check/run.mjs). Usage: node scripts/perf/first-load.mjs
// Next 16 prints no size table in `next build`, so this is the S3 size baseline (docs/plans/2026-11-16-split-plan.md section 10).
import { spawn } from "node:child_process"; import { createRequire } from "node:module"; import fs from "node:fs"; import zlib from "node:zlib";
const R = new URL("../../", import.meta.url).pathname;
const require = createRequire(R + "package.json");
const { encode } = require("next-auth/jwt");
const { startFakeDb } = await import(R + "scripts/ui-check/fake-db.mjs");
const { makeFixtures, OWNER_ID } = await import(R + "scripts/ui-check/fixtures.mjs");
const SECRET = "ui-check-secret-ui-check-secret-0123", DB = 54329, APP = 3197;
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${DB}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "ui-check", SUPABASE_SERVICE_ROLE_KEY: "ui-check", AUTH_SECRET: SECRET, NEXTAUTH_SECRET: SECRET, AUTH_TRUST_HOST: "true", NEXT_TELEMETRY_DISABLED: "1", CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", RESEND_API_KEY: "", NODE_USE_ENV_PROXY: "1", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", NODE_EXTRA_CA_CERTS: "/root/.ccr/ca-bundle.crt" };
const cookie = await encode({ token: { name: "T", email: "ui-check@example.com", picture: null, sub: OWNER_ID, googleSub: "x", profileId: OWNER_ID }, secret: SECRET, salt: "authjs.session-token" });
const db = await startFakeDb({ port: DB, fixtures: makeFixtures });
const srv = spawn("npx", ["next", "start", "-p", String(APP)], { cwd: R, env, stdio: "pipe", detached: true });

for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 300)); try { if ((await fetch(`http://localhost:${APP}/api/auth/session`)).ok) break; } catch {} }
const routes = ["/", "/calendar", "/quests", "/boards", "/insights", "/plan", "/matrix", "/journal", "/feed", "/settings", "/import", "/rewards", "/summit", "/notifications", "/power-ups"];
const gzs = {}; const size = (u) => gzs[u] ??= (() => { try { const b = fs.readFileSync(R + ".next" + u.replace(/\?.*/, "").replace(/^\/_next/, "")); return [b.length, zlib.gzipSync(b).length]; } catch { return [0, 0]; } })();
for (const r of routes) {
  const res = await fetch(`http://localhost:${APP}${r}`, { headers: { cookie: `authjs.session-token=${cookie}` }, redirect: "manual" });
  const html = await res.text();
  const js = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
  const t = js.reduce((a, u) => [a[0] + size(u)[0], a[1] + size(u)[1]], [0, 0]);
  console.log(r.padEnd(16), String(res.status), (t[1] / 1024).toFixed(0).padStart(5), "kB gzip", (t[0] / 1024).toFixed(0).padStart(5), "kB raw", js.length, "files");
}
try { process.kill(-srv.pid, "SIGTERM"); } catch {}
db.close(); process.exit(0);
