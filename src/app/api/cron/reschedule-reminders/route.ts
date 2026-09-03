import { NextRequest, NextResponse } from "next/server";
import {
  listUpcomingTasksNeedingReminder,
  markReminderSent,
} from "@/lib/data/tasks";
import { getProfileById } from "@/lib/data/profiles";
import { createNotification, markEmailSent } from "@/lib/data/notifications";
import { sendEmail } from "@/lib/email";

const WINDOW_MINUTES = 60;

/**
 * Reschedule reminder sweep (Priority #9). Not a background job on its
 * own — wire this up to Vercel Cron (add a `crons` entry in vercel.json
 * pointing here, e.g. every 15 minutes) after deploying, or trigger it
 * from any external scheduler. Protected by CRON_SECRET so it can't be
 * hit by randoms; without that env var set, the route stays open (fine
 * for local dev, not for a public deployment).
 *
 * For each open, calendar-scheduled task starting within the next hour
 * that hasn't been reminded about yet: log an in-app notification, send
 * an email (this is one of the spec's "higher-value moments"), and mark
 * it so the next sweep doesn't double-send.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const tasks = await listUpcomingTasksNeedingReminder(WINDOW_MINUTES);
  let notified = 0;

  for (const task of tasks) {
    const owner = await getProfileById(task.owner_id);
    if (!owner) continue;

    const when = task.scheduled_start
      ? new Date(task.scheduled_start).toLocaleString()
      : "soon";

    const notification = await createNotification({
      profileId: owner.id,
      kind: "reschedule_reminder",
      body: `"${task.title}" is scheduled for ${when}.`,
      taskId: task.id,
    });

    const sent = await sendEmail({
      to: owner.email,
      subject: `Upcoming: ${task.title}`,
      html: `<p>Reminder — <strong>${escapeHtml(task.title)}</strong> is coming up at ${escapeHtml(when)}.</p>`,
    });
    if (sent && notification) await markEmailSent(notification.id);

    await markReminderSent(task.id);
    notified += 1;
  }

  return NextResponse.json({ scanned: tasks.length, notified });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
