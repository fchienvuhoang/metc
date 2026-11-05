import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { invalidatePublicCampaignCache } from "@/lib/public-campaign";

export const runtime = "nodejs";

const bulkAssignSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1).max(100),
  campaignId: z.string().min(1),
});

export async function PATCH(request: Request) {
  try {
    const workspace = await getWorkspaceFromRequest(request);
    const body = bulkAssignSchema.parse(await request.json());
    const transactionIds = [...new Set(body.transactionIds)];
    const prisma = getPrisma();

    const result = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: body.campaignId, workspace },
        select: { id: true, code: true },
      });
      if (!campaign) {
        throw new Error("Thiện pháp không tồn tại trong tài khoản này.");
      }

      const transactions = await tx.bankTransaction.findMany({
        where: { id: { in: transactionIds }, workspace },
        select: {
          id: true,
          campaign: { select: { code: true } },
          allocations: { select: { campaign: { select: { code: true } } } },
        },
      });
      if (transactions.length !== transactionIds.length) {
        throw new Error("Có giao dịch không tồn tại hoặc không thuộc tài khoản này.");
      }
      if (transactions.some((transaction) => transaction.allocations.length > 0)) {
        throw new Error(
          "Danh sách có giao dịch đang được chia cho nhiều thiện pháp. Hãy bỏ chọn giao dịch đó để tránh mất phân bổ thủ công.",
        );
      }

      await tx.transactionAllocation.deleteMany({
        where: { transactionId: { in: transactionIds } },
      });
      const updated = await tx.bankTransaction.updateMany({
        where: { id: { in: transactionIds }, workspace },
        data: {
          campaignId: campaign.id,
          matchedKeyword: "Gán thủ công hàng loạt",
          classificationStatus: "MANUAL",
        },
      });
      if (updated.count !== transactionIds.length) {
        throw new Error("Không thể cập nhật đầy đủ các giao dịch. Không có thay đổi nào được lưu.");
      }

      return {
        updatedCount: updated.count,
        affectedCampaignCodes: [
          campaign.code,
          ...transactions.flatMap((transaction) => [
            transaction.campaign?.code,
            ...transaction.allocations.map((allocation) => allocation.campaign.code),
          ]),
        ],
      };
    });

    invalidatePublicCampaignCache(result.affectedCampaignCodes);
    return NextResponse.json({ updatedCount: result.updatedCount });
  } catch (error) {
    return apiError(error);
  }
}
