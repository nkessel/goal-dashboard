import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Starting a feedback build from the app: the toucan (or the button on the
 * feedback page) fires the owner's Claude Code scheduled task, which builds
 * the owner's unshipped "Next update" feedback and ships it live.
 */

/** The scheduled task that builds feedback; its token is pasted in on the feedback page. */
const RUN_URL = process.env.FEEDBACK_RUN_URL || "https://api.anthropic.com/v1/claude_code/routines/trig_014MX5e9vMWE4MGeDoCyaVP9/fire";
// Kept in app_defaults (server-only; these keys are never shared as settings).
const TOKEN_KEY = "secret.feedback_run_token";
const LAST_KEY = "secret.feedback_run_last";
/** Without a token: a request the scheduled task picks up on its next hourly check (it clears this when it starts). */
const REQUEST_KEY = "secret.feedback_build_requested";
/** Feedback before this was handled by hand, before builds could be started from the app. */
const SINCE = "2026-10-27T19:21:30Z";
/** One build at a time, roughly: don't start another within this long. */
const COOLDOWN_MS = 15 * 60_000;

async function readSecret(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("app_defaults").select("value").eq("key", key).maybeSingle<{ value: string | null }>();
  return data?.value ?? null;
}
async function writeSecret(key: string, value: string | null) {
  const db = supabaseAdmin().from("app_defaults");
  const { error } = value === null ? await db.delete().eq("key", key) : await db.upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
}

/** The owner's own feedback (and anyone's marked "for everyone") not built yet. */
export async function pendingFeedback(ownerId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("kind", "feedback")
    .is("auto_shipped_at", null)
    .gt("created_at", SINCE)
    .or(`and(owner_id.eq.${ownerId},or(review_status.is.null,review_status.neq.skipped)),review_status.eq.global`);
  return error ? 0 : (count ?? 0);
}

export type RunStatus = { connected: boolean; lastAt: string | null; lastUrl: string | null; requestedAt: string | null };

export async function runStatus(): Promise<RunStatus> {
  const [token, last, requested] = await Promise.all([readSecret(TOKEN_KEY), readSecret(LAST_KEY), readSecret(REQUEST_KEY)]);
  let l: { at?: string; url?: string | null } = {};
  try {
    l = last ? JSON.parse(last) : {};
  } catch {}
  return { connected: !!token, lastAt: l.at ?? null, lastUrl: l.url ?? null, requestedAt: requested };
}

export async function saveRunToken(token: string | null) {
  const t = token?.trim() ?? "";
  if (t && !/^sk-ant-[\w-]{20,}$/.test(t)) throw new Error("That doesn't look like a scheduled-task token (it starts with sk-ant-).");
  await writeSecret(TOKEN_KEY, t || null);
}

/**
 * Start a build. With the token it starts now and returns the run's link;
 * without one it queues the build for the scheduled task's hourly check.
 */
export async function startRun(pending: number): Promise<{ url: string | null; already?: boolean; queued?: boolean }> {
  const token = await readSecret(TOKEN_KEY);
  if (!token) {
    if (!(await readSecret(REQUEST_KEY))) await writeSecret(REQUEST_KEY, new Date().toISOString());
    return { url: null, queued: true };
  }
  const status = await runStatus();
  if (status.lastAt && Date.now() - Date.parse(status.lastAt) < COOLDOWN_MS) return { url: status.lastUrl, already: true };
  const res = await fetch(RUN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: `Started from the app by its owner. ${pending} feedback note${pending === 1 ? "" : "s"} waiting.` }),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("The build token was turned down. Generate a new one and paste it on the App feedback page.");
  if (!res.ok) throw new Error(`Couldn't start the build (${res.status}). Try again in a bit.`);
  const body = (await res.json().catch(() => ({}))) as { claude_code_session_url?: string };
  const url = typeof body.claude_code_session_url === "string" ? body.claude_code_session_url : null;
  await writeSecret(LAST_KEY, JSON.stringify({ at: new Date().toISOString(), url }));
  return { url };
}
