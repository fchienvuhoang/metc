import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getWorkspaceFromRequest } from "@/lib/auth";
import { decimalToNumber } from "@/lib/money";
import { getPrisma, retryTransientDatabaseRead } from "@/lib/prisma";
import { normalizeTransferText } from "@/lib/text";

export const runtime = "nodejs";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  campaignId: z.string().trim().optional().default("all"),
  query: z.string().trim().max(250).optional().default(""),
});

export async function GET(request: Request) {
  try {
    const workspace = await getWorkspaceFromRequest(request);
    const url = new URL(request.url);
    const input = querySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
    });
    const prisma = getPrisma();
    const normalizedQuery = normalizeTransferText(input.query);

    const where: Prisma.BankTransactionWhereInput = {
      workspace,
      ...(input.campaignId === "unmatched"
        ? { campaignId: null, allocations: { none: {} } }
        : input.campaignId !== "all"
          ? { OR: [{ campaignId: input.campaignId }, { allocations: { some: { campaignId: input.campaignId } } }] }
          : {}),
      ...(normalizedQuery
        ? {
            OR: [
              { normalizedDescription: { contains: normalizedQuery } },
              { transactionCode: { contains: input.query, mode: "insensitive" } },
              { campaign: { name: { contains: input.query, mode: "insensitive" } } },
              { campaign: { code: { contains: input.query, mode: "insensitive" } } },
              { allocations: { some: { campaign: { name: { contains: input.query, mode: "insensitive" } } } } },
              { allocations: { some: { campaign: { code: { contains: input.query, mode: "insensitive" } } } } },
              { groupedContribution: { title: { contains: input.query, mode: "insensitive" } } },
              { groupedContribution: { note: { contains: input.query, mode: "insensitive" } } },
              { groupedContribution: { entries: { some: { donorName: { contains: input.query, mode: "insensitive" } } } } },
              { groupedContribution: { entries: { some: { note: { contains: input.query, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    };

    const { total, totalPages, page, transactions } = await retryTransientDatabaseRead(async () => {
      const totalRows = await prisma.bankTransaction.count({ where });
      const pages = Math.max(1, Math.ceil(totalRows / input.pageSize));
      const currentPage = Math.min(input.page, pages);
      const rows = await prisma.bankTransaction.findMany({
        where,
        include: {
          campaign: {
            select: { id: true, code: true, name: true },
          },
          allocations: {
            include: { campaign: { select: { id: true, code: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
          groupedContribution: {
            include: { entries: { orderBy: { sortOrder: "asc" } } },
          },
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
        skip: (currentPage - 1) * input.pageSize,
        take: input.pageSize,
      });
      return { total: totalRows, totalPages: pages, page: currentPage, transactions: rows };
    });

    return NextResponse.json({
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        transactionDate: transaction.transactionDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        statementRow: transaction.statementRow,
        description: transaction.description,
        transactionCode: transaction.transactionCode,
        debitAmount: decimalToNumber(transaction.debitAmount),
        creditAmount: decimalToNumber(transaction.creditAmount),
        balanceAfter:
          transaction.balanceAfter == null ? null : decimalToNumber(transaction.balanceAfter),
        matchedKeyword: transaction.matchedKeyword,
        classificationStatus: transaction.classificationStatus,
        campaign: transaction.campaign,
        allocations: transaction.allocations.map((allocation) => ({
          campaignId: allocation.campaignId,
          amount: decimalToNumber(allocation.amount),
          campaign: allocation.campaign,
        })),
        groupedContribution: transaction.groupedContribution
          ? {
              id: transaction.groupedContribution.id,
              title: transaction.groupedContribution.title,
              note: transaction.groupedContribution.note,
              entries: transaction.groupedContribution.entries.map((entry) => ({
                id: entry.id,
                donorName: entry.donorName,
                amount: decimalToNumber(entry.amount),
                note: entry.note,
              })),
            }
          : null,
      })),
      total,
      page,
      pageSize: input.pageSize,
      totalPages,
    });
  } catch (error) {
    return apiError(error);
  }
}
