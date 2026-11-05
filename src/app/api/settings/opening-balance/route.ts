import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { invalidatePublicCampaignCache, warmPublicCampaignCaches } from "@/lib/public-campaign";

export const runtime = "nodejs";

const schema = z.object({
  cutoffDate: z.iso.date(),
  bankBalance: z.number().finite().nonnegative(),
  note: z.string().trim().max(1000).optional(),
  confirmation: z.literal("CHỐT SỐ DƯ"),
  allocations: z.array(z.object({
    campaignId: z.string().min(1),
    amount: z.number().finite().nonnegative(),
  })),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const workspace = await getWorkspaceFromRequest(request);
    const prisma = getPrisma();
    const existing = await prisma.openingBalance.findUnique({ where: { workspace } });
    if (existing) {
      return NextResponse.json(
        { error: "Số dư đầu kỳ đã được chốt và không thể khởi tạo lại." },
        { status: 409 },
      );
    }

    const campaignIds = [...new Set(input.allocations.map((item) => item.campaignId))];
    if (campaignIds.length !== input.allocations.length) {
      return NextResponse.json({ error: "Mỗi thiện pháp chỉ được phân bổ một lần." }, { status: 400 });
    }
    const campaignCount = await prisma.campaign.count({ where: { id: { in: campaignIds }, workspace } });
    if (campaignCount !== campaignIds.length) {
      return NextResponse.json({ error: "Có thiện pháp không còn tồn tại." }, { status: 400 });
    }

    const allocated = input.allocations.reduce((sum, item) => sum + item.amount, 0);
    if (allocated > input.bankBalance) {
      return NextResponse.json({ error: "Tổng phân bổ không được lớn hơn số dư ngân hàng." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const opening = await tx.openingBalance.create({
        data: {
          id: `${workspace}-opening-balance`,
          workspace,
          cutoffDate: new Date(`${input.cutoffDate}T00:00:00.000Z`),
          bankBalance: toPrismaDecimal(input.bankBalance),
          unallocatedBalance: toPrismaDecimal(input.bankBalance - allocated),
          note: input.note || null,
          allocations: {
            create: input.allocations
              .filter((item) => item.amount > 0)
              .map((item) => ({ campaignId: item.campaignId, amount: toPrismaDecimal(item.amount) })),
          },
        },
      });

      const account = await tx.bankAccount.findFirst({ where: { workspace }, orderBy: { updatedAt: "desc" } });
      if (!account) {
        await tx.bankAccount.create({
          data: {
            workspace,
            bankName: workspace,
            accountNumber: `${workspace}_UNKNOWN`,
            currentBalance: opening.bankBalance,
            balanceAsOf: opening.cutoffDate,
          },
        });
      }
    });

    const codes = await prisma.campaign.findMany({
      where: { id: { in: campaignIds }, workspace },
      select: { code: true },
    });
    const affectedCodes = invalidatePublicCampaignCache(codes.map((item) => item.code));
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
