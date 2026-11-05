import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { decimalToNumber, toPrismaDecimal } from "@/lib/money";
import { invalidatePublicCampaignCache } from "@/lib/public-campaign";

const updateTransactionSchema = z.object({
  campaignId: z.string().optional().nullable(),
  allocations: z.array(z.object({
    campaignId: z.string().min(1),
    amount: z.number().positive(),
  })).min(2).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const workspace = await getWorkspaceFromRequest(request);
    const body = updateTransactionSchema.parse(await request.json());
    const prisma = getPrisma();

    const previousTransaction = await prisma.bankTransaction.findFirst({
      where: { id, workspace },
      select: {
        creditAmount: true,
        debitAmount: true,
        campaign: { select: { code: true } },
        allocations: { select: { campaign: { select: { code: true } } } },
        groupedContribution: { select: { id: true } },
      },
    });
    if (!previousTransaction) return NextResponse.json({ error: "Không tìm thấy giao dịch." }, { status: 404 });
    const requestedCampaignIds = body.allocations?.map((item) => item.campaignId) ?? (body.campaignId ? [body.campaignId] : []);
    if (new Set(requestedCampaignIds).size !== requestedCampaignIds.length) {
      return NextResponse.json({ error: "Mỗi thiện pháp chỉ được xuất hiện một lần." }, { status: 400 });
    }
    const campaignCount = await prisma.campaign.count({ where: { id: { in: requestedCampaignIds }, workspace } });
    if (campaignCount !== requestedCampaignIds.length) {
      return NextResponse.json({ error: "Có thiện pháp không thuộc tài khoản này." }, { status: 400 });
    }

    if (previousTransaction.groupedContribution && (body.allocations || !body.campaignId)) {
      return NextResponse.json(
        { error: "Hãy xóa danh sách hùn phước nộp gộp trước khi bỏ gán hoặc chia giao dịch." },
        { status: 409 },
      );
    }

    if (body.allocations) {
      const transactionAmount = Math.max(
        decimalToNumber(previousTransaction.creditAmount),
        decimalToNumber(previousTransaction.debitAmount),
      );
      const allocatedAmount = body.allocations.reduce((sum, item) => sum + item.amount, 0);
      if (Math.round(allocatedAmount * 100) !== Math.round(transactionAmount * 100)) {
        return NextResponse.json({ error: "Tổng số tiền phân bổ phải bằng số tiền giao dịch." }, { status: 400 });
      }
    }

    const transaction = await prisma.$transaction(async (tx) => {
      await tx.transactionAllocation.deleteMany({ where: { transactionId: id } });
      const updated = await tx.bankTransaction.update({
        where: { id },
        data: {
          campaignId: body.allocations ? null : body.campaignId || null,
          matchedKeyword: body.allocations ? "Chia thủ công" : body.campaignId ? "Gán thủ công" : null,
          classificationStatus: body.allocations || body.campaignId ? "MANUAL" : "UNMATCHED",
        },
      });
      if (body.allocations) {
        await tx.transactionAllocation.createMany({
          data: body.allocations.map((item) => ({
            transactionId: id,
            campaignId: item.campaignId,
            amount: toPrismaDecimal(item.amount),
          })),
        });
      }
      return updated;
    });

    const affectedCampaigns = await prisma.campaign.findMany({
      where: { id: { in: requestedCampaignIds } },
      select: { code: true },
    });

    invalidatePublicCampaignCache([
      previousTransaction?.campaign?.code,
      ...previousTransaction.allocations.map((item) => item.campaign.code),
      ...affectedCampaigns.map((item) => item.code),
    ]);

    return NextResponse.json(transaction);
  } catch (error) {
    return apiError(error);
  }
}
