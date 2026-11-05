import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isGoogleAuthConfigured, OAUTH_STATE_COOKIE, safeRedirectPath, signAuthPayload } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!isGoogleAuthConfigured()) return NextResponse.json({ error: "Google SSO chưa được cấu hình." }, { status: 503 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = new URL("/api/auth/google/callback", origin).toString();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri,
    response_type: "code", scope: "openid email", state, prompt: "select_account",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, await signAuthPayload({
    purpose: "oauth", state, verifier, redirectUri,
    next: safeRedirectPath(request.nextUrl.searchParams.get("next")), exp: Math.floor(Date.now() / 1000) + 600,
  }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
