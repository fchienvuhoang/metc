export const READONLY_SESSION_COOKIE = "parami_readonly_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function isReadonlyDashboardConfigured() {
  return Boolean(process.env.READONLY_DASHBOARD_KEY && process.env.READONLY_DASHBOARD_PASSWORD);
}

export function verifyReadonlyAccessKey(accessKey: string) {
  const expected = process.env.READONLY_DASHBOARD_KEY;
  return Boolean(expected && constantTimeEqual(accessKey, expected));
}

export function verifyReadonlyPassword(password: string) {
  const expected = process.env.READONLY_DASHBOARD_PASSWORD;
  return Boolean(expected && constantTimeEqual(password, expected));
}

export async function createReadonlySessionToken(accessKey: string) {
  const password = process.env.READONLY_DASHBOARD_PASSWORD;
  if (!password || !verifyReadonlyAccessKey(accessKey)) {
    throw new Error("Dashboard chỉ đọc chưa được cấu hình.");
  }
  return hmacHex(password, `parami-readonly-v1:${accessKey}`);
}

export async function verifyReadonlySessionToken(token: string | undefined, accessKey: string) {
  if (!token || !verifyReadonlyAccessKey(accessKey)) return false;
  return constantTimeEqual(token, await createReadonlySessionToken(accessKey));
}

export function getReadonlySessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}
