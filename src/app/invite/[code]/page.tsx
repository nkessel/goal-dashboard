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

  const card = (children: React.ReactNode) => (
    <div data-theme="adventure" className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="parchment parchment-framed relative flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl px-6 pb-7 pt-8 text-center" style={{ color: "var(--t-ink)" }}>
        {children}
      </div>
    </div>
  );

  if (!invite) {
    return card(
      <>
        <h1 className="font-display relative z-[1] m-0 text-[24px]">This invite has expired</h1>
        <p className="relative z-[1] m-0 text-[15.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
          Ask whoever sent it for a fresh link from their party page.
        </p>
      </>
    );
  }

  const inviter = await getProfileById(invite.created_by);
  const name = inviter?.name?.split(" ")[0] || "A friend";
  const portrait = inviter?.avatar_image_url ?? inviter?.avatar_url ?? null;
  const intro = (
    <>
      <span className="relative z-[1] h-24 w-24 overflow-hidden rounded-full" style={{ padding: 3, background: "radial-gradient(circle at 35% 25%, #f6dc8e, #d9b45f 45%, #8a6c2c)", boxShadow: "0 0 0 2px #3a2e14, 0 6px 14px rgba(0,0,0,.35)" }}>
        <span className="block h-full w-full overflow-hidden rounded-full" style={{ background: "#f3e6c8" }}>
          {portrait && (
            // eslint-disable-next-line @next/next/no-img-element -- profile portrait
            <img src={portrait} alt="" className="h-full w-full object-cover" />
          )}
        </span>
      </span>
      <h1 className="font-display relative z-[1] m-0 text-[25px] leading-tight [text-wrap:balance]">{name} invited you to their party</h1>
      <p className="relative z-[1] m-0 text-[15.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        Goal Dashboard turns your to-do list into a quest log. In a party you cheer each other on and take on goals together.
      </p>
    </>
  );

  if (!session?.user) {
    return card(
      <>
        {intro}
        <form
          className="relative z-[1]"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invite/${code}` });
          }}
        >
          <button type="submit" className="hover-glow h-12 rounded-full px-7 text-[16px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Sign in with Google to join
          </button>
        </form>
      </>
    );
  }

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-sm flex-col items-center pt-10">
        <div className="parchment parchment-framed relative flex w-full flex-col items-center gap-4 rounded-3xl px-6 pb-7 pt-8 text-center" style={{ color: "var(--t-ink)" }}>
          {intro}
          <div className="relative z-[1]">
            <AcceptInviteButton code={code} inviterName={name} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
