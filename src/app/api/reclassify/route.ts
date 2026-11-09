import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { reclassifyImportedTransactions } from "@/lib/importer";
import {
  invalidatePublicCampaignCache,
  warmPublicCampaignCaches,
} from "@/lib/public-campaign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspaceFromRequest(request);
    const result = await reclassifyImportedTransactions(workspace);
    const affectedCodes = invalidatePublicCampaignCache(result.affectedCampaignCodes, workspace);
    await warmPublicCampaignCaches(affectedCodes, workspace);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
