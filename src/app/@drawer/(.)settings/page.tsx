import { requireSession } from "@/lib/session";
import { getProfileById } from "@/lib/data/profiles";
import { SettingsContent } from "@/components/settings/SettingsContent";
import { SideDrawer } from "@/components/layout/SideDrawer";

/** Settings opened from within the app: slides out from the right over the current screen. */
export default async function SettingsDrawer({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const session = await requireSession();
  const [profile, { open }] = await Promise.all([getProfileById(session.user.id), searchParams]);
  return (
    <SideDrawer theme={profile?.theme === "adventure" ? "adventure" : "calm"} title="Menu">
      <SettingsContent userId={session.user.id} open={open} />
    </SideDrawer>
  );
}
