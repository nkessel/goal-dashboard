import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";

export default async function MatrixPage() {
  const session = await requireSession();
  return (
    <AppShell userLabel={session.user.email ?? ""}>
      <ComingSoon title="Priority Matrix" />
    </AppShell>
  );
}
