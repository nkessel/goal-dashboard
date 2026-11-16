// Tap cost: how much of the screen React redraws, and how long the screen
// takes to answer, for the app's most-used controls (ranked from `ui_clicks`).
//
//   PERF_NAMES=1 npx next build --webpack     (env as in scripts/ui-check/run.mjs; keeps component names)
//   node scripts/perf/taps.mjs [--out file.json] [--only today,editor] [--throttle 4]
//
// Runs the built app against the UI check's fake database, on a phone-sized
// screen with the processor slowed 4×. For each tap it reports:
//   renders   components React ran again (mounts counted apart)
//   ms        from the tap to the next painted frame (Event Timing)
//   js / style / layout / busy   processor time in the 0.7s after the tap, by kind and in all
//   idle rows: two seconds untouched; "page redraws" should be near 0 (an animation that isn't on the
//   graphics card redraws the page 60 times a second) and "fetches" 0 (a prefetch loop)
//   top       the components that ran most
// Compare two runs:  node scripts/perf/taps.mjs --diff before.json after.json
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { encode } from "next-auth/jwt";
import { startFakeDb } from "../ui-check/fake-db.mjs";
import { makeFixtures, OWNER_ID } from "../ui-check/fixtures.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : d);

if (args.includes("--diff")) {
  const [a, b] = args.slice(args.indexOf("--diff") + 1).map((f) => JSON.parse(readFileSync(f, "utf8")));
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("tap", 44), pad("renders", 16), pad("ms to frame", 14), "ms the processor was busy");
  for (const r of a) {
    const s = b.find((x) => x.name === r.name);
    if (!s) continue;
    console.log(pad(r.name, 44), pad(`${r.renders} → ${s.renders}`, 16), pad(`${r.ms} → ${s.ms}`, 14), `busy ${r.task} → ${s.task}`, r.name.includes("idle") ? `· fetches ${r.fetches} → ${s.fetches}` : "");
  }
  process.exit(0);
}

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const ROOT = new URL("../../", import.meta.url).pathname;
const DB_PORT = 54329;
const APP_PORT = Number(opt("port", 3198));
const SECRET = "ui-check-secret-ui-check-secret-0123";
const THROTTLE = Number(opt("throttle", 4));
const only = opt("only", "").split(",").filter(Boolean);
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
  NODE_USE_ENV_PROXY: "1",
  ...(existsSync("/root/.ccr/ca-bundle.crt") ? { NODE_EXTRA_CA_CERTS: "/root/.ccr/ca-bundle.crt" } : {}),
};

/** Runs in the page before the app: watches React's commits and the browser's event timings. */
function recorder() {
  const stat = { renders: 0, mounts: 0, by: {}, commits: 0 };
  window.__perf = {
    stat,
    reset() {
      stat.renders = 0;
      stat.mounts = 0;
      stat.commits = 0;
      stat.by = {};
      window.__perfEvents = [];
    },
  };
  window.__perfEvents = [];
  const nameOf = (f) => {
    const t = f.type;
    if (!t) return null;
    if (typeof t === "function") return t.displayName || t.name || "?";
    if (typeof t === "object") {
      const inner = t.render || t.type;
      return inner ? inner.displayName || inner.name || "?" : null;
    }
    return null;
  };
  const isComp = (f) => f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15;
  const mount = (f) => {
    for (let c = f; c; c = c.sibling) {
      if (isComp(c)) stat.mounts++;
      if (c.child) mount(c.child);
    }
  };
  const walk = (f) => {
    const prev = f.alternate;
    if (!prev) {
      if (isComp(f)) stat.mounts++;
      if (f.child) mount(f.child);
      return;
    }
    if (isComp(f) && f.flags & 1) {
      stat.renders++;
      const n = nameOf(f) || "?";
      stat.by[n] = (stat.by[n] || 0) + 1;
    }
    if (f.child !== prev.child) for (let c = f.child; c; c = c.sibling) walk(c);
  };
  let id = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    inject(r) {
      this.renderers.set(++id, r);
      return id;
    },
    onCommitFiberRoot(_id, root) {
      try {
        stat.commits++;
        walk(root.current);
      } catch {}
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.interactionId) window.__perfEvents.push({ name: e.name, dur: e.duration, proc: e.processingEnd - e.processingStart });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}
}

const cookie = await encode({
  token: { name: "Robin Tester", email: "ui-check@example.com", picture: null, sub: OWNER_ID, googleSub: "ui-check-owner", profileId: OWNER_ID },
  secret: SECRET,
  salt: "authjs.session-token",
});
const db = await startFakeDb({ port: DB_PORT, fixtures: makeFixtures });
const server = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, env, stdio: "pipe", detached: true });
const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stop);
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 300));
  try {
    if ((await fetch(`http://localhost:${APP_PORT}/api/auth/session`)).ok) break;
  } catch {}
}
const browser = await chromium.launch();
const out = [];
const base = `http://localhost:${APP_PORT}`;

for (const sc of SCENARIOS) {
  if (only.length && !only.includes(sc.name)) continue;
  await fetch(`http://127.0.0.1:${DB_PORT}/__reset`, { method: "POST" }).catch(() => {});
  const desktop = sc.device === "desktop";
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "authjs.session-token", value: cookie, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript(recorder);
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  // Background page fetches: a screen that keeps asking the server while idle (a prefetch loop) shows up here.
  let fetches = 0;
  page.on("request", (r) => {
    if (r.url().includes("_rsc")) fetches++;
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const settle = async (ms = 700) => {
    await page.waitForTimeout(ms);
    try {
      await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming?.().iterations !== Infinity).length === 0, null, { timeout: 2500 });
    } catch {}
  };
  const h = {
    page,
    settle,
    async goto(path, { welcome = false } = {}) {
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      await page.evaluate(({ welcome }) => {
        const d = new Date(Date.now() - 330 * 60_000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        document.cookie = "last-path=; path=/; max-age=0";
        // The walkthrough would sit over every screen.
        localStorage.setItem("tour-state", JSON.stringify({ done: true, step: "done" }));
        if (welcome) {
          for (const k of ["daily-login", "welcome-pending", "daily-login-open", "welcome-back-at", "welcome-toucan-landed"]) localStorage.removeItem(k);
          sessionStorage.clear();
          localStorage.setItem("evening-prompt-at", "off");
        } else {
          localStorage.setItem("daily-login", key);
          localStorage.setItem("evening-prompt-at", "off");
          localStorage.setItem("evening-invited", key);
          localStorage.removeItem("welcome-pending");
          localStorage.setItem("welcome-back-at", String(Date.now()));
        }
      }, { welcome });
      await page.goto(base + path, { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await settle(welcome ? 4500 : 2500);
    },
    /** Does one thing (a tap, a key) and records what it cost. `quiet` = setup, not recorded. */
    async tap(name, target, { quiet = false, optional = false, key, wait = 700 } = {}) {
      const loc = key ? null : typeof target === "function" ? target(page) : target instanceof RegExp ? page.getByRole("button", { name: target }).first() : page.locator(target).first();
      if (loc) {
        try {
          await loc.waitFor({ state: "visible", timeout: optional ? 1500 : 5000 });
          await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        } catch {
          if (!optional) console.log(`  ! ${sc.name}: couldn't find "${name}"`);
          return false;
        }
        await page.waitForTimeout(250);
      }
      await page.evaluate(() => window.__perf.reset());
      fetches = 0;
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
      const m0 = await metrics();
      const TRACE = args.includes("--trace");
      const evs = [];
      const onData = (d) => evs.push(...d.value);
      if (TRACE) {
        cdp.on("Tracing.dataCollected", onData);
        await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing", transferMode: "ReportEvents" });
      }
      try {
        if (key) await page.keyboard.press(key);
        else if (desktop) await loc.click({ timeout: 4000 });
        else await loc.tap({ timeout: 4000 });
      } catch (e) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        console.log(`  ! ${sc.name}: couldn't tap "${name}": ${e.message.split("\n")[0].slice(0, 120)}`);
        return false;
      }
      await page.waitForTimeout(wait);
      const m1 = await metrics();
      if (TRACE) {
        const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
        await cdp.send("Tracing.end");
        await done;
        cdp.off("Tracing.dataCollected", onData);
        const sum = {};
        let els = 0;
        for (const e of evs) {
          if (e.ph !== "X") continue;
          if (["UpdateLayoutTree", "Layout", "Paint", "PrePaint", "Layerize", "Commit", "FunctionCall", "EventDispatch", "ParseAuthorStyleSheet", "ScheduleStyleRecalculation", "HitTest", "IntersectionObserverController::computeIntersections", "UpdateLayer", "CompositeLayers", "RunMicrotasks", "TimerFire", "FireAnimationFrame", "MinorGC", "MajorGC"].includes(e.name)) {
            sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
            if (e.name === "UpdateLayoutTree") els += e.args?.elementCount || 0;
          }
        }
        if (name.startsWith("idle")) {
          const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => {
            const el = a.effect?.target;
            const r = el?.getBoundingClientRect?.();
            const vis = r && r.width > 0 && r.bottom > 0 && r.top < innerHeight && el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true });
            return `${a.animationName || a.transitionProperty || "?"}@${el?.tagName?.toLowerCase()}.${String(el?.className?.baseVal ?? el?.className ?? "").split(" ").slice(0, 2).join(".")}${a.effect?.pseudoElement || ""}${vis ? "" : " (unseen)"}`;
          }));
          const by = {};
          for (const a of anims) by[a] = (by[a] || 0) + 1;
          console.log("   running animations:", Object.entries(by).map(([k, v]) => `${k}×${v}`).join(" | "));
        }
        console.log("   trace:", Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" · "), `· style elements ${els}`, `· dom ${await page.evaluate(() => document.querySelectorAll("*").length)}`);
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const d = (k) => Math.round((m1[k] - m0[k]) * 1000);
      const work = { script: d("ScriptDuration"), style: d("RecalcStyleDuration"), layout: d("LayoutDuration"), task: d("TaskDuration"), frames: m1.RecalcStyleCount - m0.RecalcStyleCount, fetches };
      const r = await page.evaluate(() => ({ ...window.__perf.stat, by: { ...window.__perf.stat.by }, events: window.__perfEvents.slice() }));
      await settle(300);
      if (quiet) return true;
      const ms = Math.round(Math.max(0, ...r.events.map((e) => e.dur)));
      const top = Object.entries(r.by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}×${c}`).join(" ");
      const row = { name: `${sc.name}: ${name}`, renders: r.renders, mounts: r.mounts, commits: r.commits, ms, ...work, top };
      out.push(row);
      console.log(`${row.name.padEnd(44)} renders ${String(row.renders).padStart(4)}  mounts ${String(row.mounts).padStart(4)}  ${String(ms).padStart(4)}ms  js ${String(work.script).padStart(3)} style ${String(work.style).padStart(3)} layout ${String(work.layout).padStart(3)} busy ${String(work.task).padStart(4)}${name.startsWith("idle") ? ` · ${work.frames} page redraws, ${work.fetches} fetches` : ""}  ${top.slice(0, 60)}`);
      return true;
    },
  };
  try {
    await sc.run(h);
  } catch (e) {
    console.log(`  ! ${sc.name} stopped: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `/tmp/perf-${sc.name}-stopped.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
stop();
db.close();
if (opt("out")) writeFileSync(opt("out"), JSON.stringify(out, null, 1));
const total = out.reduce((n, r) => n + r.renders, 0);
console.log(`\n${out.length} taps · ${total} component renders in all · median ${out.map((r) => r.ms).sort((a, b) => a - b)[out.length >> 1]}ms to the next frame (processor slowed ${THROTTLE}×)`);
process.exit(0);
