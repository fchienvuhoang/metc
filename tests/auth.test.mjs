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
  await assert.rejects(auth.createAdminSessionToken("ntluc.han@gmail.com"));
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
    for (const [email, verified, allowed] of [["other@gmail.com", true, false], ["phuongtu213@gmail.com", false, false], ["phuongtu213@gmail.com", true, true], ["fchienvuhoang@gmail.com", true, true], ["ntluc.han@gmail.com", true, false], ["ntluc.han@gmail.com", false, false]]) {
      globalThis.fetch = async (url) => Response.json(String(url).includes("/token") ? { access_token: "test-access" } : { email, email_verified: verified });
      const response = await callback.GET(new NextRequest("http://localhost:3000/api/auth/google/callback?code=test&state=test-state", { headers: { cookie: `${auth.OAUTH_STATE_COOKIE}=${state}` } }));
      const session = response.cookies.get(auth.ADMIN_SESSION_COOKIE)?.value;
      assert.equal(Boolean(session), allowed);
      if (allowed) assert.equal(await auth.verifyAdminSessionToken(session), "VIB");
      else assert.match(response.headers.get("location"), /error=access_denied/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
