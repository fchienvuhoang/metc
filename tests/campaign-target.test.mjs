import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-ts.mjs";

const { campaignProgress } = createLoader()("src/lib/campaign-target.ts");

test("progress supports no target, zero income and exceeding the target", () => {
  assert.equal(campaignProgress(100, null), null);
  assert.deepEqual(campaignProgress(0, 100), { percent: 0, barPercent: 0, remaining: 100 });
  assert.deepEqual(campaignProgress(40, 100), { percent: 40, barPercent: 40, remaining: 60 });
  assert.deepEqual(campaignProgress(125, 100), { percent: 125, barPercent: 100, remaining: 0 });
});

function routes() {
  let saved;
  const campaign = {
    findUnique: async () => null,
    findFirst: async ({ where }) => where.id === "mine" ? { code: "old" } : null,
    create: async ({ data }) => { saved = data; return { ...data, code: "test" }; },
    update: async ({ data }) => { saved = data; return { ...data, code: "test" }; },
  };
  const db = { campaign, campaignKeyword: { deleteMany: async () => {} } };
  db.$transaction = async (fn) => fn(db);
  const load = createLoader({
    "@/lib/auth": { getWorkspaceFromRequest: async () => "BIDV" },
    "@/lib/api": { apiError: () => Response.json({}, { status: 400 }) },
    "@/lib/prisma": { getPrisma: () => db },
    "@/lib/public-campaign": { invalidatePublicCampaignDefinitionCache: () => [], warmPublicCampaignDefinitionCaches: async () => {} },
  });
  return { create: load("src/app/api/campaigns/route.ts").POST, update: load("src/app/api/campaigns/[id]/route.ts").PATCH, saved: () => saved };
}

const request = (targetAmount) => new Request("http://localhost/api/campaigns", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: "test", name: "Test", status: "ACTIVE", targetAmount }),
});

test("create and update save the target; clearing and omitted targets remain distinct", async () => {
  const r = routes();
  assert.equal((await r.create(request(1000000))).status, 201);
  assert.equal(r.saved().targetAmount, 1000000);
  assert.equal(r.saved().workspace, "BIDV");
  assert.equal((await r.update(request(null), { params: Promise.resolve({ id: "mine" }) })).status, 200);
  assert.equal(r.saved().targetAmount, null);
  await r.update(request(undefined), { params: Promise.resolve({ id: "mine" }) });
  assert.equal(r.saved().targetAmount, undefined);
  assert.equal((await r.update(request(100), { params: Promise.resolve({ id: "foreign" }) })).status, 404);
});

test("both write routes reject invalid or unsafe VND targets", async () => {
  const r = routes();
  for (const value of [0, -1, 1.5, "1000000", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await r.create(request(value))).status, 400);
    assert.equal((await r.update(request(value), { params: Promise.resolve({ id: "mine" }) })).status, 400);
  }
  assert.equal(r.saved(), undefined);
});
