import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", source)((name) => overrides[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
process.env.AUTH_SECRET = "test-only-secret";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
const auth = load("../src/lib/auth.ts");
const { NextRequest } = require("next/server");
const callback = load("../src/app/api/auth/google/callback/route.ts", { "@/lib/auth": auth });

test("only the permitted emails can receive sessions", async () => {
  for (const email of ["phuongtu213@gmail.com", "fchienvuhoang@gmail.com"]) {
    assert.equal(await auth.verifyAdminSessionToken(await auth.createAdminSessionToken(email)), "VIB");
  }
  await assert.rejects(auth.createAdminSessionToken("other@gmail.com"));
  assert.equal(await auth.verifyAdminSessionToken(await auth.createAdminSessionToken("ntluc.han@gmail.com")), "BIDV");
  assert.equal(await auth.verifyAdminSessionToken(await auth.createAdminSessionToken("fchienvuhoang@gmail.com", "BIDV")), "BIDV");
  await assert.rejects(auth.createAdminSessionToken("ntluc.han@gmail.com", "VIB"));
  assert.equal(await auth.verifyAdminSessionToken(await auth.createAdminSessionToken("Phuongtu213@gmail.com", "BIDV")), "BIDV");
  assert.deepEqual(auth.getAllowedWorkspaces(" Phuongtu213@gmail.com "), ["VIB", "BIDV"]);
  const revokedSession = await auth.signAuthPayload({ purpose: "admin", email: "ntluc.han@gmail.com", workspace: "VIB", exp: Date.now() / 1000 + 60 });
  assert.equal(await auth.verifyAdminSessionToken(revokedSession), null);
});

test("reject expired, modified and wrong-purpose sessions and unsafe redirects", async () => {
  const token = await auth.createAdminSessionToken("phuongtu213@gmail.com");
  assert.equal(await auth.verifyAdminSessionToken(token + "x"), null);
  assert.equal(await auth.verifyAdminSessionToken(await auth.signAuthPayload({ purpose: "admin", email: "phuongtu213@gmail.com", workspace: "VIB", exp: 1 })), null);
  assert.equal(await auth.verifyAdminSessionToken(await auth.signAuthPayload({ purpose: "oauth", email: "phuongtu213@gmail.com", workspace: "VIB", exp: Date.now() / 1000 + 60 })), null);
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/dang-nhap"]) assert.equal(auth.safeRedirectPath(path), "/");
  assert.equal(auth.safeRedirectPath("/transactions?page=2"), "/transactions?page=2");
});

test("OAuth callback rejects invalid state before contacting Google", async () => {
  const response = await callback.GET(new NextRequest("http://localhost:3000/api/auth/google/callback?code=test&state=bad"));
  assert.match(response.headers.get("location"), /error=invalid_state/);
  assert.equal(response.cookies.get(auth.ADMIN_SESSION_COOKIE), undefined);
});

test("OAuth callback requires a verified allowlisted Google identity", async () => {
  const originalFetch = globalThis.fetch;
  const state = await auth.signAuthPayload({ purpose: "oauth", state: "test-state", verifier: "test-verifier", redirectUri: "http://localhost:3000/api/auth/google/callback", next: "/", exp: Date.now() / 1000 + 60 });
  try {
    for (const [email, verified, allowed] of [["other@gmail.com", true, false], ["phuongtu213@gmail.com", false, false], ["phuongtu213@gmail.com", true, true], ["fchienvuhoang@gmail.com", true, true], ["ntluc.han@gmail.com", true, true], ["ntluc.han@gmail.com", false, false]]) {
      globalThis.fetch = async (url) => Response.json(String(url).includes("/token") ? { access_token: "test-access" } : { email, email_verified: verified });
      const response = await callback.GET(new NextRequest("http://localhost:3000/api/auth/google/callback?code=test&state=test-state", { headers: { cookie: `${auth.OAUTH_STATE_COOKIE}=${state}` } }));
      const session = response.cookies.get(auth.ADMIN_SESSION_COOKIE)?.value;
      assert.equal(Boolean(session), allowed);
      if (allowed) assert.equal(await auth.verifyAdminSessionToken(session), email === "ntluc.han@gmail.com" ? "BIDV" : "VIB");
      else assert.match(response.headers.get("location"), /error=access_denied/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const workspaceRoute = load("../src/app/api/auth/workspace/route.ts", { "@/lib/auth": auth });

test("tenant switching enforces email permissions and origin without extending expiry", async () => {
  for (const [email, current, target, status] of [
    ["phuongtu213@gmail.com", "VIB", "BIDV", 200],
    ["phuongtu213@gmail.com", "BIDV", "VIB", 200],
    ["ntluc.han@gmail.com", "BIDV", "VIB", 403],
    ["fchienvuhoang@gmail.com", "VIB", "BIDV", 200],
    ["fchienvuhoang@gmail.com", "BIDV", "VIB", 200],
  ]) {
    const token = await auth.createAdminSessionToken(email, current);
    const response = await workspaceRoute.POST(new NextRequest("http://localhost:3000/api/auth/workspace", {
      method: "POST", headers: { origin: "http://localhost:3000", cookie: `${auth.ADMIN_SESSION_COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ workspace: target }),
    }));
    assert.equal(response.status, status);
    if (status === 200) {
      const newToken = response.cookies.get(auth.ADMIN_SESSION_COOKIE).value;
      assert.equal(await auth.verifyAdminSessionToken(newToken), target);
      assert.equal((await auth.getAdminSession(newToken)).exp, (await auth.getAdminSession(token)).exp);
    }
  }
  const token = await auth.createAdminSessionToken("fchienvuhoang@gmail.com");
  const crossOrigin = await workspaceRoute.POST(new NextRequest("http://localhost:3000/api/auth/workspace", { method: "POST", headers: { origin: "https://other.test", cookie: `${auth.ADMIN_SESSION_COOKIE}=${token}` } }));
  assert.equal(crossOrigin.status, 403);
  await assert.rejects(auth.getWorkspaceFromRequest(new Request("http://localhost:3000/api/import", { headers: { cookie: `${auth.ADMIN_SESSION_COOKIE}=${token}`, "x-workspace": "BIDV" } })), /Tenant đã thay đổi/);
});
