import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, OAUTH_STATE_COOKIE, createAdminSessionToken, getAdminSessionMaxAge, isAllowedAdminEmail, getAllowedWorkspaces, isGoogleAuthConfigured, readAuthPayload, safeRedirectPath } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  function failure(error: string) {
    const url = new URL("/dang-nhap", origin);
    url.searchParams.set("error", error);
    return finish(NextResponse.redirect(url));
  }
  function finish(response: NextResponse) {
    response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (!isGoogleAuthConfigured()) return failure("not_configured");
  const state = await readAuthPayload(request.cookies.get(OAUTH_STATE_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  if (!state || state.purpose !== "oauth" || state.state !== request.nextUrl.searchParams.get("state") || typeof state.verifier !== "string" || typeof state.redirectUri !== "string") return failure("invalid_state");
  if (!code || request.nextUrl.searchParams.has("error")) return failure("cancelled");
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: state.redirectUri, grant_type: "authorization_code", code_verifier: state.verifier,
      }), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!tokenResponse.ok) return failure("oauth_failed");
    const token = await tokenResponse.json();
    if (typeof token.access_token !== "string") return failure("oauth_failed");
    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!userResponse.ok) return failure("oauth_failed");
    const user = await userResponse.json();
    if (user.email_verified !== true || typeof user.email !== "string" || !isAllowedAdminEmail(user.email)) return failure("access_denied");
    const response = NextResponse.redirect(new URL(safeRedirectPath(state.next), origin));
    response.cookies.set(ADMIN_SESSION_COOKIE, await createAdminSessionToken(user.email, getAllowedWorkspaces(user.email)[0]), {
      httpOnly: true, maxAge: getAdminSessionMaxAge(), path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production",
    });
    return finish(response);
  } catch {
    return failure("oauth_failed");
  }
}
