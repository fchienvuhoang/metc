import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { decimalToNumber, toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { invalidatePublicCampaignCache, warmPublicCampaignCaches } from "@/lib/public-campaign";

const contributionSchema = z.object({
  title: z.string().trim().min(1).max(160).default("Phương danh thí chủ hùn phước"),
  note: z.string().trim().max(2000).optional().nullable(),
  entries: z.array(z.object({
    donorName: z.string().trim().min(1).max(160),
    amount: z.number().positive(),
    note: z.string().trim().max(500).optional().nullable(),
  })).min(1).max(500),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const workspace = await getWorkspaceFromRequest(request);
    const body = contributionSchema.parse(await request.json());
    const prisma = getPrisma();
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, workspace },
      select: {
        creditAmount: true,
        campaignId: true,
        campaign: { select: { code: true } },
        allocations: { select: { id: true } },
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Không tìm thấy giao dịch." }, { status: 404 });
    }
    if (decimalToNumber(transaction.creditAmount) <= 0) {
      return NextResponse.json({ error: "Chỉ có thể nhập danh sách hùn phước cho giao dịch Có." }, { status: 400 });
    }
    if (!transaction.campaignId || transaction.allocations.length > 0) {
      return NextResponse.json(
        { error: "Hãy gán giao dịch vào đúng một thiện pháp trước khi nhập danh sách nộp gộp." },
        { status: 400 },
      );
    }

    const entryTotal = body.entries.reduce((sum, entry) => sum + entry.amount, 0);
    const transactionTotal = decimalToNumber(transaction.creditAmount);
    if (Math.round(entryTotal * 100) !== Math.round(transactionTotal * 100)) {
      return NextResponse.json(
        {
          error: `Tổng danh sách (${formatMoney(entryTotal)}) phải đúng bằng số tiền giao dịch (${formatMoney(transactionTotal)}).`,
        },
        { status: 400 },
      );
    }

    const batch = await prisma.$transaction(async (tx) => {
      const saved = await tx.groupedContribution.upsert({
        where: { transactionId: id },
        create: {
          transactionId: id,
          title: body.title,
          note: body.note || null,
        },
        update: {
          title: body.title,
          note: body.note || null,
        },
      });
      await tx.contributionEntry.deleteMany({ where: { batchId: saved.id } });
      await tx.contributionEntry.createMany({
        data: body.entries.map((entry, index) => ({
          batchId: saved.id,
          donorName: entry.donorName,
          amount: toPrismaDecimal(entry.amount),
          note: entry.note || null,
          sortOrder: index,
        })),
      });
      return tx.groupedContribution.findUniqueOrThrow({
        where: { id: saved.id },
        include: { entries: { orderBy: { sortOrder: "asc" } } },
      });
    });

    const affectedCodes = invalidatePublicCampaignCache([transaction.campaign?.code]);
    await warmPublicCampaignCaches(affectedCodes);

    return NextResponse.json({
      id: batch.id,
      title: batch.title,
      note: batch.note,
      entries: batch.entries.map((entry) => ({
        id: entry.id,
        donorName: entry.donorName,
        amount: decimalToNumber(entry.amount),
        note: entry.note,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const workspace = await getWorkspaceFromRequest(request);
    const prisma = getPrisma();
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, workspace },
      select: { campaign: { select: { code: true } } },
    });
    if (!transaction) {
      return NextResponse.json({ error: "Không tìm thấy giao dịch." }, { status: 404 });
    }

    await prisma.groupedContribution.deleteMany({ where: { transactionId: id } });
    const affectedCodes = invalidatePublicCampaignCache([transaction.campaign?.code]);
    await warmPublicCampaignCaches(affectedCodes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}
