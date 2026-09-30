import { auth, signIn } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { getInviteByCode } from "@/lib/data/invites";
import { getProfileById } from "@/lib/data/profiles";
import { AcceptInviteButton } from "@/components/social/AcceptInviteButton";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await auth();
  const invite = await getInviteByCode(code);

  if (!invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 p-8 text-center dark:bg-black">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Invite not found</h1>
        <p className="text-sm text-zinc-500">This invite link is invalid or has expired.</p>
      </div>
    );
  }

  const inviter = await getProfileById(invite.created_by);

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 text-center dark:bg-black">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {inviter?.name || "A friend"} invited you to Goal Dashboard
        </h1>
        <p className="text-sm text-zinc-500">Sign in with Google to accept and become friends.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invite/${code}` });
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    );
  }

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {inviter?.name || "A friend"} invited you
        </h1>
        <p className="text-sm text-zinc-500">
          Accept to add {inviter?.name || "them"} as a friend on Goal Dashboard.
        </p>
        <AcceptInviteButton code={code} inviterName={inviter?.name || "them"} />
      </div>
    </AppShell>
  );
}
