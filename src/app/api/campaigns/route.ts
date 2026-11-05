import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { makeCampaignCode, normalizeTransferText } from "@/lib/text";
import {
  invalidatePublicCampaignDefinitionCache,
  warmPublicCampaignDefinitionCaches,
} from "@/lib/public-campaign";

const campaignSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).default("ACTIVE"),
  keywords: z.array(z.string().min(1)).default([]),
});

export async function GET(request: Request) {
  try {
    const workspace = await getWorkspaceFromRequest(request);
    const prisma = getPrisma();
    const campaigns = await prisma.campaign.findMany({
      where: { workspace },
      include: {
        keywords: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(campaigns);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = campaignSchema.parse(await request.json());
    const workspace = await getWorkspaceFromRequest(request);
    const prisma = getPrisma();
    const code = makeCampaignCode(body.code);
    const keywords = uniqueKeywords([body.code, ...body.keywords]);

    const existingCampaign = await prisma.campaign.findUnique({
      where: { code },
      select: { name: true },
    });
    if (existingCampaign) {
      return NextResponse.json(
        { error: `Mã thiện pháp “${code}” đã được sử dụng bởi “${existingCampaign.name}”. Vui lòng nhập mã khác.` },
        { status: 409 },
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        workspace,
        code,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        status: body.status,
        keywords: {
          createMany: {
            data: keywords.map((keyword) => ({
              keyword,
              normalizedKeyword: normalizeTransferText(keyword),
              active: body.status !== "COMPLETED",
            })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        keywords: true,
      },
    });
    const affectedCodes = invalidatePublicCampaignDefinitionCache([campaign.code]);
    await warmPublicCampaignDefinitionCaches(affectedCodes);

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      const normalized = normalizeTransferText(keyword);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
}
