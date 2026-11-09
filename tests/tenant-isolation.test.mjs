import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-ts.mjs";
import { NextRequest } from "next/server.js";

const api = { apiError: (error) => Response.json({ error: error.message }, { status: 400 }) };
const cache = { invalidatePublicCampaignCache() {}, warmPublicCampaignCaches() {} };

test("BIDV cannot read/import VIB Gmail even with a valid session", async () => {
  let gmailCalled = false;
  const route = createLoader({
    "@/lib/auth": { getWorkspaceFromRequest: async () => "BIDV" },
    "@/lib/api": api,
    "@/lib/prisma": { getPrisma: () => { throw new Error("DB should not be reached"); } },
    "@/lib/importer": {}, "@/lib/public-campaign": cache,
    "@/lib/vib-email": { getLatestVibStatementFromEmail: () => { gmailCalled = true; }, isVibEmailConfigured: () => true },
  })("src/app/api/import/email/route.ts");
  const request = new NextRequest("http://localhost/api/import/email");
  assert.equal((await route.GET(request)).status, 403);
  assert.equal((await route.POST(request)).status, 403);
  assert.equal(gmailCalled, false);
});

test("transaction edits cannot find IDs or assign campaigns belonging to another tenant", async () => {
  let findArgs;
  let countArgs;
  let missingTransaction = true;
  let wrote = false;
  const route = createLoader({
    "@/lib/auth": { getWorkspaceFromRequest: async () => "BIDV" }, "@/lib/api": api, "@/lib/public-campaign": cache,
    "@/lib/prisma": { getPrisma: () => ({
      bankTransaction: { findFirst: async (args) => { findArgs = args; return missingTransaction ? null : { creditAmount: 100, debitAmount: 0, campaign: null, allocations: [], groupedContribution: null }; } },
      campaign: { count: async (args) => { countArgs = args; return 0; } },
      $transaction: async () => { wrote = true; },
    }) },
  })("src/app/api/transactions/[id]/route.ts");
  const request = () => new NextRequest("http://localhost/api/transactions/foreign-id", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: "vib-campaign-id" }) });
  assert.equal((await route.PATCH(request(), { params: Promise.resolve({ id: "foreign-id" }) })).status, 404);
  assert.deepEqual(findArgs.where, { id: "foreign-id", workspace: "BIDV" });
  missingTransaction = false;
  assert.equal((await route.PATCH(request(), { params: Promise.resolve({ id: "own-id" }) })).status, 400);
  assert.equal(countArgs.where.workspace, "BIDV");
  assert.equal(wrote, false);
});

test("public list/detail lookup and cache keys separate identical campaign codes", async () => {
  const keys = [];
  const queries = [];
  const tags = [];
  const lib = createLoader({
    "next/cache": { unstable_cache: (fn, key) => { keys.push(key); return fn; }, revalidateTag: (tag) => tags.push(tag) },
    "@/lib/prisma": { retryTransientDatabaseRead: (fn) => fn(), getPrisma: () => ({ campaign: {
      findUnique: async (args) => { queries.push(args.where); return null; },
      findMany: async (args) => { queries.push(args.where); return []; },
    } }) },
  })("src/lib/public-campaign.ts");
  for (const workspace of ["VIB", "BIDV"]) {
    await lib.getCachedPublicCampaignMeta("tp01", workspace);
    await lib.getCachedPublicCampaignData("tp01", workspace);
    await lib.getCachedPublicCampaignList(workspace);
    lib.invalidatePublicCampaignDefinitionCache(["tp01"], workspace);
  }
  assert.deepEqual(queries[0], { workspace_code: { workspace: "VIB", code: "tp01" } });
  assert.deepEqual(queries[3], { workspace_code: { workspace: "BIDV", code: "tp01" } });
  assert.equal(new Set(keys.map(JSON.stringify)).size, 6);
  assert.ok(tags.includes("public-campaign-data:BIDV:tp01"));
  assert.ok(tags.includes("public-campaign-list:VIB"));
});
