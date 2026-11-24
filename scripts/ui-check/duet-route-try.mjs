import { spawn } from "node:child_process";
import { startFakeDb } from "./fake-db.mjs";
import { makeFixtures, OWNER_ID } from "./fixtures.mjs";
const fx = () => {
  const f = makeFixtures();
  f.app_defaults = [...(f.app_defaults ?? []), { key: "secret.duet_key", value: "k123" }, { key: "secret.duet_owner", value: OWNER_ID }];
  for (const r of f.rites ?? []) if (r.kind === "habit") r.kind = null;
  for (const p of f.profiles ?? []) if (p.id === OWNER_ID) p.check_metrics = ["Mood", "Focus"];
  return f;
};
const db = await startFakeDb({ port: 54329, fixtures: fx });
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "ui-check", AUTH_SECRET: "devsecretdevsecretdevsecret", AUTH_TRUST_HOST: "true", TZ: "UTC" };
const p = spawn("npx", ["next", "start", "-p", "3198"], { env, stdio: "pipe", detached: true });
let logs = ""; p.stdout.on("data", (d) => (logs += d)); p.stderr.on("data", (d) => (logs += d));
for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 300)); try { if ((await fetch("http://localhost:3198/api/auth/session")).ok) break; } catch {} }
const call = async (action, args = {}) => {
  const r = await fetch("http://localhost:3198/api/duet", { method: "POST", headers: { "content-type": "application/json", "x-duet-key": "k123" }, body: JSON.stringify({ action, args }) });
  const j = await r.json(); console.log(action, JSON.stringify(args), "->", JSON.stringify(j).slice(0, 600)); return j;
};
try {
  const t = await call("today");
  console.log("vitamins:", JSON.stringify(t.data?.daily_habits?.find((h) => /Vitamins/.test(h.title))));
  await call("tick_subhabit", { habit: "Vitamins", step: "B12" });
  await call("tick_subhabit", { habit: "Vitamins", step: "B12" });
  await call("tick_subhabit", { habit: "Vitamins", step: "vit" });
  await call("tick_subhabit", { habit: "Vitamins", step: "Vitamins" });
  await call("tick_subhabit", { habit: "Vitamins", step: "Vitamins", on: false });
  await call("undo");
  await call("check_in", { metrics: { Mood: 7, energy: 6, Focus: 5.5 }, notes: ["Slept well #sleep"] });
  await call("check_in", { metrics: { Joy: 7 } });
  const c = await call("check_ins");
  const key = c.data?.entries?.find((e) => e.kind === "note")?.key;
  await call("remove_check_in", { ids: [key] });
  await call("undo");
  await call("check_ins");
  await call("undo");
  await call("check_ins");
} finally { try { process.kill(-p.pid, "SIGTERM"); } catch {} db.close(); if (process.env.LOGS) console.log(logs.slice(-3000)); process.exit(0); }
