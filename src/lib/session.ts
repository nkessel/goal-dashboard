import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Use in server components/pages that require a signed-in user.
 * Redirects to the sign-in screen ("/") if there's no session.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  return session;
}
