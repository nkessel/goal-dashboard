// Live E2E test for Priority #10: theme toggle (calm/adventure), avatar
// builder, monster-icon picker with search fallback, and the goal-progress
// keyboard-accessibility fix. Same mint-a-session technique as
// browser-test.mjs; cleans up its own test data.
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("OK:", msg);
  }
}

const stamp = Date.now();
const name = `Priority10 Tester ${stamp}`;
const email = `pw-p10-${stamp}@example.com`;
const { data: profile, error } = await db
  .from("profiles")
  .insert({ google_sub: `pw-p10-${stamp}`, email, name })
  .select("*")
  .single();
if (error) throw error;

const cookieValue = await encode({
  token: { name, email, picture: null, sub: profile.id, googleSub: profile.google_sub, profileId: profile.id },
  secret: env.NEXTAUTH_SECRET,
  salt: "authjs.session-token",
});

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
await context.addCookies([
  { name: "authjs.session-token", value: cookieValue, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
});

try {
  // --- Settings: theme toggle ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  assert(await page.getByRole("heading", { name: "Settings" }).isVisible(), "Settings page renders");

  await page.getByRole("button", { name: /adventure/i }).click();
  await page.waitForTimeout(800);
  await page.waitForLoadState("networkidle");

  // --- Priority view reflects adventure theme ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const themeAttr = await page.evaluate(() => document.querySelector("[data-theme]")?.getAttribute("data-theme"));
  assert(themeAttr === "adventure", "data-theme flips to 'adventure' after toggling");
  assert(await page.getByText("⚔️ Today's Battle").isVisible(), "Priority heading shows battle framing in adventure mode");

  // --- Avatar builder ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  const avatarButtons = page.locator("section", { hasText: "Avatar" }).getByRole("button");
  const baseCount = await avatarButtons.count();
  assert(baseCount > 0, "avatar builder renders option buttons");
  // pick a distinctive emoji option if present, else just click the second button
  const dragonBtn = page.getByRole("button", { name: "🐉" }).first();
  if (await dragonBtn.count()) {
    await dragonBtn.click();
  } else {
    await avatarButtons.nth(1).click();
  }
  await page.getByRole("button", { name: /save avatar/i }).click();
  await page.waitForTimeout(500);
  const { data: afterAvatar } = await db.from("profiles").select("avatar_base").eq("id", profile.id).single();
  assert(!!afterAvatar?.avatar_base, "avatar_base persisted after clicking an avatar option");

  // --- Monster icon picker with search fallback ---
  const { data: task } = await db
    .from("tasks")
    .insert({ owner_id: profile.id, title: "Slay the inbox dragon", importance: 3, urgency: 3 })
    .select("*")
    .single();

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const taskRow = page.locator("li", { hasText: "Slay the inbox dragon" });
  assert(await taskRow.isVisible(), "task appears in adventure-themed priority list");

  await taskRow.getByTitle("Choose a monster icon").click(); // opens icon picker
  const monsterOption = page.getByTitle("Dragon");
  if (await monsterOption.count()) {
    await monsterOption.click();
  }
  await page.waitForTimeout(400);
  const { data: afterIconMonster } = await db.from("tasks").select("icon_key, icon_source").eq("id", task.id).single();
  assert(afterIconMonster?.icon_key === "dragon" && afterIconMonster?.icon_source === "monster", "picking a monster icon persists icon_key/icon_source");

  // reopen picker, switch to search tab, search "chicken"
  await taskRow.getByTitle("Choose a monster icon").click();
  const searchTab = page.getByRole("button", { name: /search any icon/i });
  if (await searchTab.count()) {
    await searchTab.click();
    const searchInput = page.getByPlaceholder(/chicken/i);
    await searchInput.fill("chicken");
    await page.waitForTimeout(400);
    const results = page.locator("button", { hasText: "🐔" });
    const resultCount = await results.count();
    assert(resultCount > 0, "searching 'chicken' returns a usable icon (🐔) via emojilib fallback");
    if (resultCount > 0) {
      await results.first().click();
      await page.waitForTimeout(400);
      const { data: afterIconSearch } = await db.from("tasks").select("icon_key, icon_source").eq("id", task.id).single();
      assert(afterIconSearch?.icon_source === "library" && !!afterIconSearch?.icon_key, "picking a searched emoji persists as icon_source='library'");
    }
  } else {
    assert(false, "search tab is present in icon picker");
  }

  // --- Keyboard accessibility fix on goal progress slider ---
  const { data: board, error: boardErr } = await db
    .from("boards")
    .insert({ owner_id: profile.id, title: "Priority10 Board" })
    .select("*")
    .single();
  if (boardErr) throw boardErr;
  const { data: goal, error: goalErr } = await db
    .from("goals")
    .insert({ owner_id: profile.id, board_id: board.id, title: "Keyboard-testable goal" })
    .select("*")
    .single();
  if (goalErr) throw goalErr;

  await page.goto(`${BASE}/boards/${board.id}`, { waitUntil: "networkidle" });
  const slider = page.locator('input[type="range"]');
  await slider.first().focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowRight");
  }
  // No mouseup/touchend ever fires here — only keyboard events — so this
  // exercises exactly the onKeyUp/onBlur commit path added for a11y.
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // blur the slider
  await page.waitForTimeout(500);
  const { data: afterGoal } = await db.from("goals").select("progress").eq("id", goal.id).single();
  assert((afterGoal?.progress ?? 0) > 0, `keyboard-only slider interaction persists progress (got ${afterGoal?.progress})`);

  assert(errors.length === 0, `no console/page errors during Priority #10 run (${JSON.stringify(errors)})`);
} finally {
  await browser.close();
  // cleanup
  await db.from("tasks").delete().eq("owner_id", profile.id);
  const { data: boards } = await db.from("boards").select("id").eq("owner_id", profile.id);
  for (const b of boards ?? []) {
    await db.from("goals").delete().eq("board_id", b.id);
  }
  await db.from("boards").delete().eq("owner_id", profile.id);
  await db.from("profiles").delete().eq("id", profile.id);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll Priority #10 tests passed.");
}
