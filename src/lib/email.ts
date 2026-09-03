import "server-only";

/**
 * Email delivery for "higher-value moments only" (spec's phrase) — a friend
 * cheering a completed goal via comment, and upcoming reschedule reminders.
 * Plain reactions and routine social noise stay in-app only.
 *
 * Uses Resend when RESEND_API_KEY is configured. Without a key, this
 * degrades gracefully to a console log instead of throwing — the in-app
 * notification (already written to the DB by the caller) still lands either
 * way, so a missing key never breaks the feature, it just means no email
 * goes out until a key is added.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM || "Goal Dashboard <onboarding@resend.dev>";

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(
      `[email:skipped, no RESEND_API_KEY] to=${input.to} subject="${input.subject}"`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!res.ok) {
      console.error(`Resend send failed (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend send threw:", err);
    return false;
  }
}
