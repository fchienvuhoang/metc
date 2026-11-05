import type { BankWorkspace } from "@prisma/client";

export const ADMIN_SESSION_COOKIE = "metc_admin_session";
export const OAUTH_STATE_COOKIE = "metc_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const ADMIN_EMAILS = new Set(["phuongtu213@gmail.com", "fchienvuhoang@gmail.com", "ntluc.han@gmail.com"]);

export function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);
}

export function isAllowedAdminEmail(email: string) {
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function getAdminSessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

export async function signAuthPayload(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${await hmacHex(encoded)}`;
}

export async function readAuthPayload(token: string | undefined): Promise<Record<string, unknown> | null> {
  if (!token || !process.env.AUTH_SECRET) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra || !constantTimeEqual(signature, await hmacHex(payload))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.exp !== "number" || data.exp <= Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export async function createAdminSessionToken(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!isAllowedAdminEmail(normalized)) throw new Error("Email không có quyền quản trị.");
  return signAuthPayload({ purpose: "admin", email: normalized, workspace: "VIB", exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
}

export async function verifyAdminSessionToken(token: string | undefined): Promise<BankWorkspace | null> {
  const data = await readAuthPayload(token);
  return data?.purpose === "admin" && data.workspace === "VIB" && typeof data.email === "string" && isAllowedAdminEmail(data.email) ? "VIB" : null;
}

export async function getWorkspaceFromRequest(request: Request): Promise<BankWorkspace> {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
  const workspace = await verifyAdminSessionToken(cookie);
  if (!workspace) throw new Error("Phiên đăng nhập không hợp lệ.");
  return workspace;
}

export function safeRedirectPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  return value.startsWith("/dang-nhap") ? "/" : value;
}

async function hmacHex(message: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET chưa được cấu hình.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return diff === 0;
}
