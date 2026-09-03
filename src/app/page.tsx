import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Goal Dashboard
      </h1>

      {session?.user ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-zinc-700 dark:text-zinc-300">
            Signed in as <strong>{session.user.name}</strong> (
            {session.user.email})
          </p>
          <p className="text-xs text-zinc-500">
            profile id: {session.user.id}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign in with Google
          </button>
        </form>
      )}
    </div>
  );
}
