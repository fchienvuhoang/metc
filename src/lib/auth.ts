import type { BankWorkspace } from "@prisma/client";

export const ADMIN_SESSION_COOKIE = "dhamma_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function isAdminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function getAdminSessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

export async function createAdminSessionToken(workspace: BankWorkspace) {
  const secret = passwordForWorkspace(workspace);
  if (!secret) throw new Error("Mật khẩu tài khoản chưa được cấu hình.");
  return `${workspace}.${await hmacHex(secret, `dhamma-admin-session-v2:${workspace}`)}`;
}

export async function verifyAdminSessionToken(token: string | undefined): Promise<BankWorkspace | null> {
  if (!token) return null;
  const [workspace, signature] = token.split(".");
  if (workspace !== "VIB" || !signature) return null;
  const expected = await createAdminSessionToken(workspace);
  return constantTimeEqual(token, expected) ? workspace : null;
}

export function verifyAdminPassword(password: string): BankWorkspace | null {
  const expected = process.env.ADMIN_PASSWORD;
  return expected && constantTimeEqual(password, expected) ? "VIB" : null;
}

export async function getWorkspaceFromRequest(request: Request): Promise<BankWorkspace> {
  const cookie = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  const workspace = await verifyAdminSessionToken(cookie ? decodeURIComponent(cookie) : undefined);
  if (!workspace) throw new Error("Phiên đăng nhập không hợp lệ.");
  return workspace;
}

export function safeRedirectPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.startsWith("/dang-nhap") ? "/" : value;
}

function passwordForWorkspace(workspace: BankWorkspace) {
  return workspace === "VIB" ? process.env.ADMIN_PASSWORD : undefined;
}

async function hmacHex(secret: string, message: string) {
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
