// UI check: run before every push to main.
//
//   npm run ui-check                 build, then walk every screen (≈6–10 min)
//   npm run ui-check -- --no-build   reuse the last ui-check build (.next from this script)
//   npm run ui-check -- --only today,import --devices phone --times evening
//
// It builds the app against an in-memory fake database (scripts/ui-check/fake-db.mjs,
// seeded from fixtures.mjs: no secrets, nothing real touched), signs in as a test
// account with a minted session cookie, and walks the flows in flows.mjs on a phone
// (390×844), the phone with the iPhone keyboard up (simulated) and a tablet
// (820×1180), in the morning and the evening. At each step it looks for:
//   off-screen-edge   text or a control past the screen's edge (or a popup off the top/bottom)
//   clipped           a control or text partly cut off by its box
//   floating-overlap  two floating things (toucan, bubble, buttons) on top of each other
//   covered           a floating thing sitting on a control or text
//   field-under-keyboard / under-keyboard   the keyboard hides the field or a button
//   moved-on-tap      the thing you tapped jumped (or bounced) afterwards
//   layout-shift      the page jumped with no tap (late content pushing things)
//   not-restored      opening and closing a section left the screen different
//   console-error / page-error / server-error
// Output: ui-check-out/report.md (read this), report.json, and a screenshot per step
// with the problems boxed in red (errors) and orange (warnings).
// Exit code 1 when there are errors not listed in known-issues.json.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { encode } from "next-auth/jwt";
import { startFakeDb } from "./fake-db.mjs";
import { makeFixtures, OWNER_ID } from "./fixtures.mjs";
import { installRecorders, auditPage, snapshotLayout, fakeKeyboard, drawBoxes, clearBoxes } from "./audit.mjs";
import { FLOWS } from "./flows.mjs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = ROOT + "ui-check-out/";
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const DB_PORT = 54329;
const APP_PORT = Number(opt("port", 3199));
const SECRET = "ui-check-secret-ui-check-secret-0123";
const KB = 336; // iPhone keyboard height with the suggestion bar, in CSS px
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};
const TIMES = { morning: 8.5, evening: 20.75 };
const only = opt("only", "").split(",").filter(Boolean);
const devices = opt("devices", "phone,tablet").split(",");
const times = opt("times", "morning,evening").split(",");
const known = existsSync(new URL("known-issues.json", import.meta.url)) ? JSON.parse(readFileSync(new URL("known-issues.json", import.meta.url), "utf8")) : [];

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${DB_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "ui-check",
  SUPABASE_SERVICE_ROLE_KEY: "ui-check",
  AUTH_SECRET: SECRET,
  NEXTAUTH_SECRET: SECRET,
  AUTH_TRUST_HOST: "true",
  CLOUDFLARE_API_TOKEN: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  RESEND_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
  // Cloud containers reach Google Fonts through a proxy (harmless elsewhere).
  NODE_USE_ENV_PROXY: "1",
  ...(existsSync("/root/.ccr/ca-bundle.crt") ? { NODE_EXTRA_CA_CERTS: "/root/.ccr/ca-bundle.crt" } : {}),
};

function run(cmd, cmdArgs, extraEnv = {}, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, env: { ...env, ...extraEnv }, stdio: quiet ? "pipe" : "inherit" });
    let out = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (out += d));
    p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}\n${out.slice(-3000)}`))));
  });
}

/** An IANA zone where it's about `hour` o'clock right now (Etc/GMT signs are reversed). */
function zoneFor(hour) {
  const now = new Date();
  const utc = now.getUTCHours() + now.getUTCMinutes() / 60;
  let off = Math.round(hour - utc);
  while (off > 14) off -= 24;
  while (off < -12) off += 24;
  return off === 0 ? "Etc/GMT" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}`;
}

async function startServer(tz) {
  const logs = [];
  try {
    await fetch(`http://localhost:${APP_PORT}/`);
    throw new Error(`port ${APP_PORT} is already in use (an earlier ui-check still running?). Stop it or pass --port N.`);
  } catch (e) {
    if (e.message.startsWith("port")) throw e;
  }
  const p = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, env: { ...env, APP_TIMEZONE: tz, TZ: tz }, stdio: "pipe", detached: true });
  const stop = () => {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  };
  process.on("exit", stop);
  p.stdout.on("data", (d) => logs.push(String(d)));
  p.stderr.on("data", (d) => logs.push(String(d)));
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const r = await fetch(`http://localhost:${APP_PORT}/api/auth/session`);
      if (r.ok) return { p, logs, stop };
    } catch {}
  }
  stop();
  throw new Error("next start didn't come up:\n" + logs.join(""));
}

const results = [];
const steps = [];
let shotN = 0;

async function walk({ browser, device, time, tz, cookie }) {
  const ctx = await browser.newContext({ ...DEVICES[device], timezoneId: tz.startsWith("Etc/GMT") ? tz : tz, locale: "en-US" });
  await ctx.addCookies([{ name: "authjs.session-token", value: cookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript(installRecorders);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  page.on("pageerror", (e) => errors.push({ kind: "page-error", detail: e.message.split("\n")[0].slice(0, 300) }));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource.*(favicon|_vercel)/.test(t)) return;
    errors.push({ kind: "console-error", detail: t.split("\n")[0].slice(0, 300) });
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push({ kind: "server-error", detail: `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}` });
  });

  let screen = "start";
  let kb = 0;
  const base = `http://localhost:${APP_PORT}`;

  const record = (issue) => {
    const key = `${screen}|${issue.kind}|${issue.target}`;
    const isKnown = known.some((k) => (k.key ? key.includes(k.key) : false) || (k.match && new RegExp(k.match).test(`${key}|${issue.detail}`)));
    results.push({ device, time, screen, ...issue, key, known: isKnown, keyboard: kb > 0 });
  };

  async function settle(ms = 500) {
    await page.waitForTimeout(ms);
    try {
      await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming?.().iterations !== Infinity).length === 0, null, { timeout: 2500 });
    } catch {}
    await page.waitForTimeout(120);
  }

  async function flushErrors() {
    for (const e of errors.splice(0)) record({ ...e, severity: "error", target: page.url().replace(base, "") });
    const shifts = await page.evaluate(() => (window.__uiShifts || []).splice(0)).catch(() => []);
    for (const s of shifts) {
      if (s.value < 0.02) continue;
      record({ kind: "layout-shift", severity: s.value > 0.08 ? "error" : "warn", target: s.sources.map((x) => x.node).join(", ") || "page", detail: `page jumped with no tap (shift ${s.value.toFixed(3)}; ${s.sources.map((x) => `${x.node} moved ${x.dy}px${x.dh ? `, grew ${x.dh}px` : ""}`).join("; ")})` });
    }
  }

  async function check(label, { scroll = true } = {}) {
    await settle(250);
    const name = `${String(++shotN).padStart(3, "0")}-${device}-${time}${kb ? "-kb" : ""}-${screen}-${label}`.replace(/[^\w.-]+/g, "_").slice(0, 120);
    const top = await page.evaluate(auditPage, { label, kbHeight: kb });
    for (const i of top.issues) record({ ...i, step: label, shot: name + ".png" });
    await page.evaluate(drawBoxes, top.issues);
    await page.screenshot({ path: `${OUT}shots/${name}.png` });
    await page.evaluate(clearBoxes);
    steps.push({ device, time, screen, label, shot: name + ".png", issues: top.issues.length });
    await flushErrors();
    if (scroll && !kb) {
      // The bottom of the page, and of every scroll box: anything still covered there can't be reached.
      const moved = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll("*")].filter((el) => {
          const s = getComputedStyle(el);
          return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 80;
        });
        const saved = [[document.scrollingElement, document.scrollingElement.scrollTop], ...boxes.map((b) => [b, b.scrollTop])];
        window.__uiSaved = saved;
        let any = document.scrollingElement.scrollHeight > innerHeight + 40;
        document.scrollingElement.scrollTop = 1e6;
        for (const b of boxes) {
          b.scrollTop = 1e6;
          any = true;
        }
        return any;
      });
      if (moved) {
        await settle(250);
        const bottom = await page.evaluate(auditPage, { label, kbHeight: 0 });
        const seen = new Set(top.issues.map((i) => i.kind + i.target));
        const extra = bottom.issues.filter((i) => !seen.has(i.kind + i.target));
        if (extra.length) {
          const bname = name + "-bottom";
          for (const i of extra) record({ ...i, step: label + " (scrolled to the bottom)", shot: bname + ".png" });
          await page.evaluate(drawBoxes, extra);
          await page.screenshot({ path: `${OUT}shots/${bname}.png` });
          await page.evaluate(clearBoxes);
        }
        await page.evaluate(() => {
          for (const [el, y] of window.__uiSaved || []) el.scrollTop = y;
        });
        await settle(150);
        // Things that follow the page as it scrolls (menus, bubbles) "shift" during our own scroll: not a bug.
        await page.evaluate(() => (window.__uiShifts || []).splice(0)).catch(() => {});
      }
    }
    await flushErrors();
  }

  function find(target) {
    if (target instanceof RegExp) return page.getByRole("button", { name: target }).first();
    if (typeof target === "function") return target(page);
    if (typeof target !== "string") return target;
    if (target.startsWith("css=")) return page.locator(target.slice(4)).first();
    if (target.startsWith("text=")) return page.getByText(target.slice(5), { exact: false }).first();
    return page.getByRole("button", { name: target }).first();
  }

  /** Taps something; flags it if it jumps (or bounces) afterwards. */
  async function tap(target, label, { expectMove = false, optional = false, wait = 700 } = {}) {
    const loc = find(target);
    try {
      await loc.waitFor({ state: "visible", timeout: optional ? 1500 : 5000 });
    } catch {
      if (!optional) record({ kind: "step-skipped", severity: "info", target: String(target), detail: `couldn't find "${label}" to tap (update flows.mjs if the screen changed)` });
      return false;
    }
    // Centred first, so the tap itself doesn't scroll (that would read as a jump).
    await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })).catch(() => {});
    await page.waitForTimeout(150);
    const handle = await loc.elementHandle();
    const track = handle ? page.evaluate(([el, ms]) => window.__uiTrack(el, ms), [handle, wait + 600]).catch(() => null) : null;
    try {
      if (DEVICES[device].hasTouch) await loc.tap({ timeout: 4000 });
      else await loc.click({ timeout: 4000 });
    } catch (e) {
      record({ kind: "tap-failed", severity: optional ? "info" : "error", target: String(target), detail: `couldn't tap "${label}": ${e.message.split("\n")[0].slice(0, 160)}` });
      return false;
    }
    const moved = await track;
    if (moved && !moved.gone && !expectMove) {
      // Moved in the page and on screen both (a page that just got shorter and scrolled back isn't a jump).
      const jump = Math.max(Math.min(Math.abs(moved.dy), Math.abs(moved.dy - moved.scrolled)), Math.abs(moved.dx));
      const bounce = moved.maxDev - Math.max(Math.abs(moved.dy), Math.abs(moved.dx));
      if (jump > 6) record({ kind: "moved-on-tap", severity: "error", target: label, detail: `what you tapped moved ${moved.dy - moved.scrolled}px down / ${moved.dx}px right after the tap` });
      else if (bounce > 8) record({ kind: "moved-on-tap", severity: "warn", target: label, detail: `what you tapped bounced ${moved.maxDev}px and came back` });
    }
    await settle(wait);
    return true;
  }

  /** Opens a section, checks it, closes it, and checks the screen came back the same. */
  async function toggle(target, label, { closeWith, inside } = {}) {
    const before = await page.evaluate(snapshotLayout);
    if (!(await tap(target, `open ${label}`))) return false;
    await check(`${label}-open`);
    if (inside) await inside();
    const closed = closeWith ? await tap(closeWith, `close ${label}`) : await tap(target, `close ${label}`);
    if (!closed) {
      await page.keyboard.press("Escape");
      await settle(500);
    }
    const after = await page.evaluate(snapshotLayout);
    const moved = Object.keys(before).filter((k) => after[k] && (Math.abs(after[k][1] - before[k][1]) > 3 || Math.abs(after[k][3] - before[k][3]) > 3));
    const missing = Object.keys(before).filter((k) => !after[k]);
    if (moved.length > 2 || missing.length > 2)
      record({ kind: "not-restored", severity: "warn", target: label, detail: `after closing, ${moved.length} things sit elsewhere and ${missing.length} are gone (e.g. ${[...moved, ...missing].slice(0, 3).map((k) => k.split("#")[0]).join(", ")})` });
    return true;
  }

  /** Focuses a field, raises the (simulated) keyboard, checks, types, and lowers it. */
  async function typeIn(target, label, text = "Testing the keyboard") {
    const loc = find(target);
    try {
      await loc.waitFor({ state: "visible", timeout: 4000 });
    } catch {
      record({ kind: "step-skipped", severity: "info", target: String(target), detail: `couldn't find field "${label}"` });
      return false;
    }
    if (device === "phone") {
      try {
        await loc.tap({ timeout: 4000 });
      } catch (e) {
        record({ kind: "tap-failed", severity: "info", target: String(target), detail: `couldn't focus "${label}": ${e.message.split("\n")[0].slice(0, 120)}` });
        return false;
      }
      await page.evaluate(fakeKeyboard, KB);
      kb = KB;
      await settle(400);
      await loc.pressSequentially(text, { delay: 5 }).catch(() => {});
      await check(`${label}-keyboard`, { scroll: false });
      await page.evaluate(() => document.activeElement?.blur());
      await page.evaluate(fakeKeyboard, 0);
      kb = 0;
      await settle(400);
    } else {
      await loc.click({ timeout: 4000 }).catch(() => {});
      await loc.pressSequentially(text, { delay: 5 }).catch(() => {});
      await page.evaluate(() => document.activeElement?.blur());
    }
    return true;
  }

  async function goto(path, { welcome = false, name, reset = welcome } = {}) {
    screen = name || path.replace(/^\//, "").replace(/\//g, "-") || "today";
    if (reset) await fetch(`http://127.0.0.1:${DB_PORT}/__reset`, { method: "POST" });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ welcome }) => {
        const d = new Date(Date.now() - 330 * 60_000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        // Today opens the screen you were last on; each flow starts where it says instead.
        document.cookie = "last-path=; path=/; max-age=0";
        if (welcome) {
          for (const k of ["daily-login", "welcome-pending", "daily-login-open", "welcome-back-at", "welcome-toucan-landed"]) localStorage.removeItem(k);
          sessionStorage.clear();
        } else {
          localStorage.setItem("daily-login", key);
          localStorage.removeItem("welcome-pending");
          localStorage.setItem("welcome-back-at", String(Date.now()));
        }
      },
      { welcome }
    );
    await page.goto(base + path, { waitUntil: "load", timeout: 30000 }).catch((e) => record({ kind: "slow-page", severity: "warn", target: path, detail: e.message.split("\n")[0] }));
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => {
      window.__uiTrack = (el, ms) => new Promise((resolve) => {
        const start = el.getBoundingClientRect();
        const sy = window.scrollY;
        let maxDev = 0;
        const t0 = performance.now();
        const tick = () => {
          if (!el.isConnected) return resolve({ gone: true });
          const r = el.getBoundingClientRect();
          const dy = r.top + window.scrollY - (start.top + sy);
          const dx = r.left - start.left;
          maxDev = Math.max(maxDev, Math.abs(dy - (window.scrollY - sy)), Math.abs(dx));
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve({ gone: false, dx: Math.round(dx), dy: Math.round(dy), maxDev: Math.round(maxDev), scrolled: Math.round(window.scrollY - sy) });
        };
        requestAnimationFrame(tick);
      });
    });
    await settle(welcome ? 4500 : 1200);
  }

  const h = { page, device, time, goto, check, tap, toggle, typeIn, settle, find, record, isPhone: device === "phone", get screen() { return screen; }, set screen(s) { screen = s; } };
  for (const flow of FLOWS) {
    if (only.length && !only.includes(flow.name)) continue;
    if (flow.devices && !flow.devices.includes(device)) continue;
    if (flow.times && !flow.times.includes(time)) continue;
    await fetch(`http://127.0.0.1:${DB_PORT}/__reset`, { method: "POST" }).catch(() => {});
    try {
      let timer;
      await Promise.race([flow.run(h), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`flow took over 4 minutes (stuck at screen "${screen}")`)), 240_000)))]).finally(() => clearTimeout(timer));
    } catch (e) {
      record({ kind: "flow-crashed", severity: "error", target: flow.name, detail: e.message.split("\n")[0].slice(0, 300) });
      await page.screenshot({ path: `${OUT}shots/${String(++shotN).padStart(3, "0")}-${device}-${time}-${flow.name}-CRASH.png` }).catch(() => {});
    }
    // A flow that went offline never leaves the next flows without a connection.
    await page.context().setOffline(false).catch(() => {});
    await flushErrors().catch(() => {});
    process.stdout.write(`  ${device} ${time} ${flow.name}: done\n`);
  }
  await ctx.close();
}

// ------------------------------------------------------------------ main
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT + "shots", { recursive: true });

if (!flag("no-build")) {
  console.log("Building the app against the fake database (next build --webpack)…");
  await run("npx", ["next", "build", "--webpack"]);
}

const cookie = await encode({
  token: { name: "Robin Tester", email: "ui-check@example.com", picture: null, sub: OWNER_ID, googleSub: "ui-check-owner", profileId: OWNER_ID },
  secret: SECRET,
  salt: "authjs.session-token",
});
const browser = await chromium.launch();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
const dbNotes = new Set();
const serverNotes = [];
for (const time of times) {
  const tz = zoneFor(TIMES[time]);
  const db = await startFakeDb({ port: DB_PORT, fixtures: makeFixtures });
  const server = await startServer(tz);
  console.log(`\n${time} (${tz}):`);
  try {
    for (const device of devices) await walk({ browser, device, time, tz, cookie });
  } finally {
    server.stop();
    db.close();
    for (const u of db.log.unsupported) dbNotes.add(u.slice(0, 220));
    for (const t of db.log.unknownTables) dbNotes.add(`unknown table ${t}`);
    for (const l of server.logs.join("").split("\n")) if (/error/i.test(l) && !/ui-check|FAKE/.test(l)) serverNotes.push(l.slice(0, 240));
    await new Promise((r) => setTimeout(r, 500));
  }
}
await browser.close();

// ------------------------------------------------------------------ report
const fresh = results.filter((r) => !r.known);
const errs = fresh.filter((r) => r.severity === "error");
const warns = fresh.filter((r) => r.severity === "warn");
const infos = fresh.filter((r) => r.severity === "info");
const group = (list) => {
  const m = new Map();
  for (const r of list) {
    const k = `${r.screen} · ${r.kind} · ${r.target}`;
    const g = m.get(k) || { ...r, where: new Set(), shots: new Set() };
    g.where.add(`${r.device}${r.keyboard ? "+keyboard" : ""} ${r.time}`);
    if (r.shot) g.shots.add(r.shot);
    m.set(k, g);
  }
  return [...m.values()];
};
const line = (g) => `- **${g.screen}** · \`${g.kind}\` · ${g.target}: ${g.detail}${g.step ? ` (step: ${g.step})` : ""} — ${[...g.where].join(", ")}${g.shots.size ? ` — [${[...g.shots][0]}](shots/${[...g.shots][0]})` : ""}`;
const md = [
  `# UI check — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
  "",
  `${steps.length} screenshots · **${group(errs).length} errors** · ${group(warns).length} warnings · ${results.filter((r) => r.known).length} known (known-issues.json)`,
  "",
  "Boxes in the screenshots: red = error, orange = warning. Simulated keyboard = visualViewport shrunk by 336px (can't show iOS panning; still check on a real iPhone).",
  "",
  "## Errors",
  ...(errs.length ? group(errs).map(line) : ["None."]),
  "",
  "## Warnings",
  ...(warns.length ? group(warns).map(line) : ["None."]),
  "",
  "## Steps that couldn't run",
  ...(infos.length ? group(infos).map(line) : ["None."]),
  "",
  "## Check limitations (fake database)",
  ...(dbNotes.size ? [...dbNotes].slice(0, 40).map((n) => `- ${n}`) : ["None."]),
  "",
  "## Server log errors",
  ...(serverNotes.length ? [...new Set(serverNotes)].slice(0, 30).map((n) => `- \`${n}\``) : ["None."]),
  "",
  "## Steps",
  ...steps.map((s) => `- ${s.device} ${s.time} · ${s.screen} · ${s.label}${s.issues ? ` (${s.issues})` : ""} — [shot](shots/${s.shot})`),
].join("\n");
writeFileSync(OUT + "report.md", md);
writeFileSync(OUT + "report.json", JSON.stringify({ results, steps, dbNotes: [...dbNotes], serverNotes }, null, 1));
console.log(`\n${group(errs).length} errors, ${group(warns).length} warnings. Report: ui-check-out/report.md`);
for (const g of group(errs).slice(0, 25)) console.log("  ✗ " + line(g).replace(/ — \[.*$/, ""));
process.exit(errs.length ? 1 : 0);
