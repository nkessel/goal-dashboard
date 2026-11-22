import { gate } from "@/lib/duet/auth";
import { runDuet } from "@/lib/duet";

// Claude, in another app, reaches the quests, habits and boards through here (see docs/DUET.md): the database
// function `public.duet(action, args)` posts to this route with the key held in app_defaults. No session, no cookies.
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const g = await gate(request.headers.get("x-duet-key"));
  if (!g.ok) return json({ ok: false, error: g.error }, g.status);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "The body must be JSON: {\"action\": \"today\", \"args\": {}}." }, 400);
  }
  const b = (body ?? {}) as { action?: unknown; args?: unknown };
  if (typeof b.action !== "string" || !b.action) return json({ ok: false, error: "Missing action." }, 400);
  if (b.args !== undefined && b.args !== null && (typeof b.args !== "object" || Array.isArray(b.args))) return json({ ok: false, error: "args must be an object." }, 400);
  return json(await runDuet(g.ownerId, b.action, (b.args ?? {}) as Record<string, unknown>));
}
