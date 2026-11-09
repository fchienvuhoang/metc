import { DashboardShell } from "@/components/dashboard-shell";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminSession } from "@/lib/auth";
import { getDashboardState } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await getAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) throw new Error("Phiên đăng nhập không hợp lệ.");
  const state = await getDashboardState(session.workspace);

  return <DashboardShell state={state} allowedWorkspaces={session.allowedWorkspaces} />;
}
