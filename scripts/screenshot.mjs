import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const stamp = Date.now();
const name = `Screenshot Demo ${stamp}`;
const email = `pw-shot-${stamp}@example.com`;
const { data: profile } = await db
  .from("profiles")
  .insert({ google_sub: `pw-shot-${stamp}`, email, name, total_xp: 480, level: 3, streak_count: 4 })
  .select("*")
  .single();

const cookieValue = await encode({
  token: { name, email, picture: null, sub: profile.id, googleSub: profile.google_sub, profileId: profile.id },
  secret: env.NEXTAUTH_SECRET,
  salt: "authjs.session-token",
});

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
await context.addCookies([{ name: "authjs.session-token", value: cookieValue, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "+ Add task" }).click();
await page.getByPlaceholder("Task title").fill("Ship the v1 launch email");
await page.locator('input[name="xpValue"]').fill("15");
await page.locator('form:has(input[placeholder="Task title"]) button[type="submit"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/screenshot-priority.png" });

await page.goto(`${BASE}/matrix`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/screenshot-matrix.png" });

await page.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/screenshot-feed.png" });

await browser.close();

// cleanup
await db.from("xp_events").delete().eq("owner_id", profile.id);
await db.from("activity_events").delete().eq("owner_id", profile.id);
await db.from("tasks").delete().eq("owner_id", profile.id);
await db.from("profiles").delete().eq("id", profile.id);
console.log("done");
