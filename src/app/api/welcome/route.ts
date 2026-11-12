import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dailyCheckInAction, welcomeContextAction } from "@/app/actions";

/**
 * Everything the welcome screen waits on, in one request (owner, Nov 12: "prioritize the welcome
 * screen loading faster"). It is asked for by the page's first script, while the app's code is
 * still loading, and as a plain request it doesn't queue behind the other server actions a page
 * fires as it opens. `first=1` also records the day's login (the server never pays it twice).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const url = new URL(req.url);
  const first = url.searchParams.get("first") === "1";
  const tz = Number(url.searchParams.get("tz"));
  const [ctx, checkin] = await Promise.all([
    welcomeContextAction().catch(() => null),
    first ? dailyCheckInAction(Number.isFinite(tz) ? tz : 0).catch(() => null) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ctx, checkin, first }, { headers: { "cache-control": "no-store" } });
}
