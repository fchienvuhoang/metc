import type { BankWorkspace, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError, type InputJsonObject } from "@prisma/client/runtime/client";
import { classifyDescription, type KeywordRule } from "@/lib/classifier";
import { toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { normalizeTransferText } from "@/lib/text";
import { parseVibStatement } from "@/lib/vib";

export type ImportResult = {
  batchId: string;
  sourceLabel: string;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  accountNumber: string | null;
  closingBalance: number | null;
  affectedCampaignCodes: string[];
};

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function importVibStatement(fileBuffer: Buffer, fileName: string) {
  const prisma = getPrisma();
  const workspace: BankWorkspace = "VIB";
  const parsed = await parseVibStatement(fileBuffer);
  const rules = await loadKeywordRules(prisma, workspace);
  const openingBalance = await prisma.openingBalance.findUnique({
    where: { workspace },
    select: { cutoffDate: true },
  });

  if (openingBalance) {
    const olderRow = parsed.rows.find((row) => row.transactionDate < openingBalance.cutoffDate);
    if (olderRow) {
      throw new Error(
        `Sao kê có giao dịch trước ngày bắt đầu quản lý (${openingBalance.cutoffDate.toLocaleDateString("vi-VN")}). Hãy chỉ import từ ngày đã chốt trở đi.`,
      );
    }
  }

  const uniqueRows = new Map<string, (typeof parsed.rows)[number]>();
  for (const row of parsed.rows) {
    if (!uniqueRows.has(row.transactionCode)) {
      uniqueRows.set(row.transactionCode, row);
    }
  }

  return prisma.$transaction(async (tx: TransactionClient) => {
    const accountNumber = parsed.meta.accountNumber;
    const account = await tx.bankAccount.upsert({
      where: { accountNumber },
      update: {
        workspace,
        bankName: parsed.meta.sourceBank,
        currency: parsed.meta.currency,
        currentBalance: toPrismaDecimal(parsed.meta.closingBalance ?? 0),
        balanceAsOf: parsed.meta.toDate,
      },
      create: {
        workspace,
        bankName: parsed.meta.sourceBank,
        accountNumber,
        currency: parsed.meta.currency,
        currentBalance: toPrismaDecimal(parsed.meta.closingBalance ?? 0),
        balanceAsOf: parsed.meta.toDate,
      },
    });

    const batch = await tx.importBatch.create({
      data: {
        workspace,
        sourceLabel: fileName,
        sourceBank: parsed.meta.sourceBank,
        accountId: account.id,
        fromDate: parsed.meta.fromDate,
        toDate: parsed.meta.toDate,
        openingBalance: null,
        closingBalance:
          parsed.meta.closingBalance == null ? null : toPrismaDecimal(parsed.meta.closingBalance),
        totalRows: parsed.rows.length,
      },
    });

    const transactionCodes = [...uniqueRows.keys()];
    const existing = await tx.bankTransaction.findMany({
      where: { workspace, transactionCode: { in: transactionCodes } },
      select: { transactionCode: true },
    });
    const existingCodes = new Set(existing.map((item) => item.transactionCode));
    const insertableRows = [...uniqueRows.values()].filter((row) => !existingCodes.has(row.transactionCode));

    const data = insertableRows.map((row) => {
      const classification = classifyDescription(row.description, rules);

      return {
        workspace,
        accountId: account.id,
        importBatchId: batch.id,
        campaignId: classification.campaignId,
        transactionDate: row.transactionDate,
        statementRow: row.statementRow,
        description: row.description,
        normalizedDescription: normalizeTransferText(row.description),
        transactionCode: row.transactionCode,
        debitAmount: toPrismaDecimal(row.debitAmount),
        creditAmount: toPrismaDecimal(row.creditAmount),
        balanceAfter: row.balanceAfter == null ? null : toPrismaDecimal(row.balanceAfter),
        matchedKeyword: classification.matchedKeyword,
        classificationStatus: classification.status,
        raw: row.raw as InputJsonObject,
      };
    });

    const created = data.length
      ? await tx.bankTransaction.createMany({
          data,
          skipDuplicates: true,
        })
      : { count: 0 };

    const duplicateRows = parsed.rows.length - created.count;
    const unmatchedRows = data.filter((row) => row.classificationStatus === "UNMATCHED").length;
    const campaignCodesById = new Map(rules.map((rule) => [rule.campaignId, rule.campaignCode]));
    const affectedCampaignCodes = [
      ...new Set(
        data
          .map((row) => row.campaignId && campaignCodesById.get(row.campaignId))
          .filter((code): code is string => Boolean(code)),
      ),
    ];

    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        insertedRows: created.count,
        duplicateRows,
        unmatchedRows,
      },
    });

    return {
      batchId: batch.id,
      sourceLabel: fileName,
      totalRows: parsed.rows.length,
      insertedRows: created.count,
      duplicateRows,
      unmatchedRows,
      accountNumber,
      closingBalance: parsed.meta.closingBalance,
      affectedCampaignCodes,
    } satisfies ImportResult;
  });
}

export async function reclassifyImportedTransactions() {
  const prisma = getPrisma();
  const workspace: BankWorkspace = "VIB";
  const rules = await loadKeywordRules(prisma, workspace);
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspace,
      classificationStatus: {
        not: "MANUAL",
      },
      OR: [
        { campaignId: null },
        {
          campaign: {
            status: {
              not: "COMPLETED",
            },
          },
        },
      ],
    },
    select: {
      id: true,
      description: true,
      campaignId: true,
      campaign: {
        select: { code: true },
      },
    },
  });

  let matchedRows = 0;
  let unmatchedRows = 0;
  const affectedCampaignIds = new Set<string>();
  const affectedCampaignCodes = new Set<string>();

  const updates = transactions.map((transaction) => {
    if (transaction.campaignId) {
      affectedCampaignIds.add(transaction.campaignId);
    }
    if (transaction.campaign?.code) {
      affectedCampaignCodes.add(transaction.campaign.code);
    }
    const classification = classifyDescription(transaction.description, rules);
    if (classification.campaignId) {
      affectedCampaignIds.add(classification.campaignId);
    }
    if (classification.status === "MATCHED") {
      matchedRows += 1;
    } else {
      unmatchedRows += 1;
    }

    return prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        campaignId: classification.campaignId,
        matchedKeyword: classification.matchedKeyword,
        classificationStatus: classification.status,
        normalizedDescription: normalizeTransferText(transaction.description),
      },
    });
  });

  for (let index = 0; index < updates.length; index += 20) {
    await Promise.all(updates.slice(index, index + 20));
  }

  return {
    totalRows: transactions.length,
    matchedRows,
    unmatchedRows,
    affectedCampaignCodes: [
      ...affectedCampaignCodes,
      ...rules
        .filter((rule) => affectedCampaignIds.has(rule.campaignId))
        .map((rule) => rule.campaignCode),
    ].filter((code, index, codes) => codes.indexOf(code) === index),
  };
}

async function loadKeywordRules(prisma: PrismaClient, workspace: BankWorkspace): Promise<KeywordRule[]> {
  const keywords = await prisma.campaignKeyword.findMany({
    where: {
      active: true,
      campaign: {
        workspace,
        status: {
          not: "COMPLETED",
        },
      },
    },
    include: {
      campaign: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  return keywords.map((keyword) => ({
    campaignId: keyword.campaign.id,
    campaignCode: keyword.campaign.code,
    campaignName: keyword.campaign.name,
    keyword: keyword.keyword,
    normalizedKeyword: keyword.normalizedKeyword,
    matchType: keyword.matchType,
  }));
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof PrismaClientKnownRequestError && error.code === "P2002";
}
