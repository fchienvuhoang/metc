import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/dang-nhap", "/thien-phap", "/bao-cao", "/api/auth", "/api/readonly-login", "/_next", "/favicon.ico"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const workspace = await verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (workspace) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Cần đăng nhập quản trị." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/dang-nhap";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|dang-nhap|thien-phap|bao-cao|api/auth|api/readonly-login|favicon.ico|.*\\..*).*)"],
};

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
