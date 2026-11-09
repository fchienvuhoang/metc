import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminSession, signAuthPayload } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Cần đăng nhập." }, { status: 401 });
  // A tenant switch changes the authority used by later writes. Require same-origin requests.
  const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : request.nextUrl.origin;
  if (request.headers.get("origin") !== expectedOrigin) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  const expectedWorkspace = request.headers.get("x-workspace");
  if (expectedWorkspace && expectedWorkspace !== session.workspace) return NextResponse.json({ error: "Tenant đã thay đổi. Vui lòng tải lại trang." }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || !session.allowedWorkspaces.includes(body.workspace)) return NextResponse.json({ error: "Bạn không có quyền truy cập tenant này." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, await signAuthPayload({ purpose: "admin", email: session.email, workspace: body.workspace, exp: session.exp }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: Math.max(0, Math.floor(session.exp - Date.now() / 1000)),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
