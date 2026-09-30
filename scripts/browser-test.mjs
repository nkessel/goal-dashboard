// Live end-to-end UI test against the running dev server, using real
// Playwright browser automation (not just curl/DB scripts). Auth is
// provided via a session cookie minted with next-auth/jwt's encode() for a
// throwaway profile — the same encrypted format a real Google sign-in
// would produce, decoded identically by the app; no real credentials
// involved. Mints fresh profiles every run and deletes them at the end so
// re-runs start from a clean slate.
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
async function makeUser(label) {
  const name = `Playwright ${label} ${stamp}`;
  const email = `pw-${label}-${stamp}@example.com`;
  const { data: profile, error } = await db
    .from("profiles")
    .insert({ google_sub: `pw-${label}-${stamp}`, email, name })
    .select("*")
    .single();
  if (error) throw error;

  const cookieValue = await encode({
    token: { name, email, picture: null, sub: profile.id, googleSub: profile.google_sub, profileId: profile.id },
    secret: env.NEXTAUTH_SECRET,
    salt: "authjs.session-token",
  });
  return { profile, name, email, cookieValue };
}

const ava = await makeUser("ava");
const ben = await makeUser("ben");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function newSession(user) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "authjs.session-token", value: user.cookieValue, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });
  page.__errors = errors;
  return page;
}

const avaPage = await newSession(ava);
const benPage = await newSession(ben);

try {
  // --- Priority view ---
  await avaPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  assert(avaPage.url() === `${BASE}/`, `Ava lands on Priority view (not redirected) — url=${avaPage.url()}`);
  assert(await avaPage.getByText("Today's Priorities").isVisible(), "Priority heading visible");
  assert(await avaPage.getByText(/Level \d/).first().isVisible(), "XP/level widget visible");

  await avaPage.getByRole("button", { name: /Daily check-in/ }).click();
  await avaPage.waitForTimeout(1200);
  assert(await avaPage.getByText("✓ Checked in").isVisible(), "check-in button flips to '✓ Checked in' after clicking");
  assert(await avaPage.getByText(/1-day streak/).isVisible(), "streak count shows 1-day after first check-in");

  await avaPage.getByRole("button", { name: "+ Add task" }).click();
  await avaPage.getByPlaceholder("Task title").fill("Playwright test task");
  await avaPage.locator('input[name="xpValue"]').fill("20");
  await avaPage.locator('form:has(input[placeholder="Task title"]) button[type="submit"]').click();
  await avaPage.waitForTimeout(1000);
  assert(await avaPage.getByText("Playwright test task").isVisible(), "newly created task appears in the task list");
  assert(await avaPage.getByText(/20\/100 XP assigned/).isVisible(), "weekly XP budget line reflects the new task's 20 XP");

  const taskRow = avaPage.locator("li", { hasText: "Playwright test task" }).first();
  await taskRow.getByRole("button", { name: /Pin to Top 3/ }).click();
  await avaPage.waitForTimeout(800);
  assert(await avaPage.getByText("(1/3)").isVisible(), "pinning a task updates the Top 3 counter");

  await avaPage.locator("li", { hasText: "Playwright test task" }).first().getByRole("button", { name: "Complete" }).click();
  await avaPage.getByRole("button", { name: "Confirm" }).click();
  await avaPage.waitForLoadState("networkidle");
  await avaPage.waitForTimeout(1000);
  assert(await avaPage.getByText("(0/3)").isVisible(), "Top 3 counter drops back to 0 once the task is completed");
  assert(await avaPage.getByText("Playwright test task").isVisible(), "completed task still shows up on the page (now in the Completed section)");
  assert(await avaPage.getByText("undo").isVisible(), "completed task shows an 'undo' control");
  assert(await avaPage.getByText(/25 XP total/).isVisible().catch(() => false), "total XP reflects check-in bonus (+5) and task completion (+20) = 25");

  // --- Boards / Goals ---
  await avaPage.goto(`${BASE}/boards`, { waitUntil: "networkidle" });
  await avaPage.getByRole("button", { name: "+ New board" }).click();
  await avaPage.getByPlaceholder("Board name (e.g. Dreaming, Startup, Daily Tasks)").fill("Playwright Board");
  await avaPage.getByRole("button", { name: "Create" }).click();
  await avaPage.waitForTimeout(1000);
  assert(await avaPage.getByText("Playwright Board").isVisible(), "new board appears on /boards");

  await avaPage.getByText("Playwright Board").click();
  await avaPage.waitForLoadState("networkidle");
  await avaPage.getByRole("button", { name: "+ Add goal" }).click();
  await avaPage.getByPlaceholder("Goal title").fill("Playwright Goal");
  await avaPage.getByRole("button", { name: "Create" }).click();
  await avaPage.waitForTimeout(1000);
  assert(await avaPage.getByText("Playwright Goal").isVisible(), "new goal appears on the board page");

  const plusBtn = avaPage.getByRole("button", { name: "+", exact: true });
  for (let i = 0; i < 20; i++) {
    await plusBtn.click();
    await avaPage.waitForTimeout(150);
  }
  await avaPage.waitForTimeout(1000);
  assert(await avaPage.getByText("100%").isVisible().catch(() => false), "goal progress reaches 100% via the + button (5 at a time)");

  // --- Priority Matrix ---
  await avaPage.goto(`${BASE}/matrix`, { waitUntil: "networkidle" });
  assert(await avaPage.getByRole("heading", { name: "Priority Matrix" }).isVisible(), "Matrix page renders its heading");

  // --- Friend Feed: directory + friend request ---
  await avaPage.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  assert(await avaPage.getByRole("heading", { name: "Friend Feed" }).isVisible(), "Feed page renders its heading");
  assert(await avaPage.getByText(ben.name, { exact: true }).isVisible(), "Ben appears in Ava's directory");
  await avaPage.locator("li", { hasText: ben.name }).getByRole("button", { name: "+ Add friend" }).click();
  await avaPage.waitForTimeout(1000);
  assert(await avaPage.getByText("Request sent").isVisible(), "friend request shows as sent in Ava's directory");

  // --- Ben accepts, reacts, comments ---
  await benPage.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  assert(await benPage.getByText(/Friend requests/).isVisible(), "Ben sees the incoming friend request section");
  await benPage.getByRole("button", { name: "Accept" }).click();
  await benPage.waitForTimeout(1000);
  assert(
    await benPage.locator("h2", { hasText: "Directory" }).locator("..").getByText(ava.name, { exact: true }).isVisible().catch(() => false),
    "Ava shows up as a friend in Ben's directory after accepting"
  );

  const feedItem = benPage.locator("li", { hasText: "Playwright Goal" }).first();
  const hasFeedItem = await feedItem.isVisible().catch(() => false);
  assert(hasFeedItem, "Ava's goal-completion activity is visible in Ben's feed (privacy resolution + friend fan-out)");
  if (hasFeedItem) {
    await feedItem.locator('input[placeholder="🦖"]').fill("🚀");
    await feedItem.locator('input[placeholder="🦖"]').press("Enter");
    await benPage.waitForTimeout(1000);
    assert(await feedItem.getByText("🚀", { exact: false }).isVisible().catch(() => false), "Ben's custom emoji reaction shows up on the activity");

    await feedItem.getByPlaceholder("Write a comment…").fill("Nice job Ava!");
    await feedItem.getByRole("button", { name: "Send" }).click();
    await feedItem.getByText("Nice job Ava!").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    assert(await feedItem.getByText("Nice job Ava!").isVisible().catch(() => false), "Ben's comment shows up on the activity");
  }

  // --- Ava's notifications ---
  await avaPage.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  const notifText = await avaPage.locator("body").innerText();
  assert(notifText.includes("commented") || notifText.includes("reacted"), "Ava's notifications page shows Ben's reaction/comment");

  // --- Invite link renders ---
  await avaPage.goto(`${BASE}/feed`, { waitUntil: "networkidle" });
  assert(await avaPage.getByText("Invite a friend").isVisible(), "invite link box renders");

  // --- Console/page error sweep ---
  assert(avaPage.__errors.length === 0, `no console/page errors for Ava across the run (${JSON.stringify(avaPage.__errors)})`);
  assert(benPage.__errors.length === 0, `no console/page errors for Ben across the run (${JSON.stringify(benPage.__errors)})`);
} finally {
  await browser.close();

  // --- Cleanup: delete everything the two test profiles touched ---
  for (const u of [ava, ben]) {
    await db.from("notifications").delete().eq("profile_id", u.profile.id);
    await db.from("activity_comments").delete().eq("profile_id", u.profile.id);
    await db.from("activity_reactions").delete().eq("profile_id", u.profile.id);
  }
  await db.from("activity_events").delete().eq("owner_id", ava.profile.id);
  await db.from("xp_events").delete().eq("owner_id", ava.profile.id);
  await db.from("goals").delete().eq("owner_id", ava.profile.id);
  await db.from("boards").delete().eq("owner_id", ava.profile.id);
  await db.from("tasks").delete().eq("owner_id", ava.profile.id);
  await db.from("invite_links").delete().in("created_by", [ava.profile.id, ben.profile.id]);
  await db.from("friendships").delete().or(`requester_id.eq.${ava.profile.id},requester_id.eq.${ben.profile.id}`);
  await db.from("profiles").delete().in("id", [ava.profile.id, ben.profile.id]);
}

console.log(`\n${failures === 0 ? "All" : failures + " FAILED,"} browser tests ${failures === 0 ? "passed" : "of"}.`);
process.exit(failures === 0 ? 0 : 1);
