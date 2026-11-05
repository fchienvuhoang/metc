import { DashboardShell } from "@/components/dashboard-shell";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth";
import { getDashboardState } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const workspace = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!workspace) throw new Error("Phiên đăng nhập không hợp lệ.");
  const state = await getDashboardState(workspace);

  return <DashboardShell state={state} />;
}
