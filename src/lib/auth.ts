import type { BankWorkspace } from "@prisma/client";

export const ADMIN_SESSION_COOKIE = "metc_admin_session";
export const OAUTH_STATE_COOKIE = "metc_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const EMAIL_WORKSPACES: Record<string, BankWorkspace[]> = {
  "phuongtu213@gmail.com": ["VIB"],
  "fchienvuhoang@gmail.com": ["VIB", "BIDV"],
  "ntluc.han@gmail.com": ["BIDV"],
};

export function getAllowedWorkspaces(email: string): BankWorkspace[] {
  return [...(EMAIL_WORKSPACES[email.trim().toLowerCase()] ?? [])];
}

export function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);
}

export function isAllowedAdminEmail(email: string) {
  return getAllowedWorkspaces(email).length > 0;
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

export async function createAdminSessionToken(email: string, requestedWorkspace?: BankWorkspace) {
  const normalized = email.trim().toLowerCase();
  const allowed = getAllowedWorkspaces(normalized);
  const workspace = requestedWorkspace ?? allowed[0];
  if (!workspace || !allowed.includes(workspace)) throw new Error("Email không có quyền truy cập tenant này.");
  return signAuthPayload({ purpose: "admin", email: normalized, workspace, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
}

export async function getAdminSession(token: string | undefined) {
  const data = await readAuthPayload(token);
  if (data?.purpose !== "admin" || typeof data.email !== "string" || (data.workspace !== "VIB" && data.workspace !== "BIDV")) return null;
  const allowedWorkspaces = getAllowedWorkspaces(data.email);
  if (!allowedWorkspaces.includes(data.workspace)) return null;
  return { email: data.email, workspace: data.workspace as BankWorkspace, allowedWorkspaces, exp: data.exp as number };
}

export async function verifyAdminSessionToken(token: string | undefined): Promise<BankWorkspace | null> {
  return (await getAdminSession(token))?.workspace ?? null;
}

export async function getWorkspaceFromRequest(request: Request): Promise<BankWorkspace> {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
  const workspace = await verifyAdminSessionToken(cookie);
  if (!workspace) throw new Error("Phiên đăng nhập không hợp lệ.");
  const expectedWorkspace = request.headers.get("x-workspace");
  if (expectedWorkspace && expectedWorkspace !== workspace) throw new Error("Tenant đã thay đổi ở tab khác. Vui lòng tải lại trang trước khi thao tác.");
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
