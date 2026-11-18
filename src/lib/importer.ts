import type { BankWorkspace, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError, type InputJsonObject } from "@prisma/client/runtime/client";
import { classifyDescription, type KeywordRule } from "@/lib/classifier";
import { toPrismaDecimal } from "@/lib/money";
import { getPrisma } from "@/lib/prisma";
import { normalizeTransferText } from "@/lib/text";
import { parseAcbStatement, isAcbOpeningTransfer, isAcbPersonalReceipt } from "@/lib/acb";
import { workspaceBankName } from "@/lib/workspace";
import { parseVibStatement } from "@/lib/vib";

export type ImportResult = {
  batchId: string;
  sourceLabel: string;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  excludedRows: number;
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
  return importBankStatement(fileBuffer, fileName, "VIB");
}

export async function importBankStatement(fileBuffer: Buffer, fileName: string, workspace: BankWorkspace) {
  const parsed = workspace === "BIDV" ? await parseAcbStatement(fileBuffer) : await parseVibStatement(fileBuffer);
  if (parsed.meta.sourceBank !== workspaceBankName(workspace)) {
    throw new Error(`File sao kê không thuộc ngân hàng ${workspaceBankName(workspace)} đang chọn.`);
  }
  if (workspace === "BIDV" && parsed.meta.accountNumber !== "28808031") {
    throw new Error("Sổ ACB hiện quản lý tài khoản 28808031. Vui lòng chọn đúng sao kê tài khoản này.");
  }
  const excluded = parsed.rows.filter(row => parsed.meta.sourceBank === "ACB" && isAcbOpeningTransfer(parsed.meta.accountNumber, row));
  const included = parsed.rows.filter(row => !excluded.includes(row));
  const prisma = getPrisma();
  const rules = await loadKeywordRules(prisma, workspace);
  const openingBalance = await prisma.openingBalance.findUnique({
    where: { workspace },
    select: { cutoffDate: true },
  });

  if (openingBalance) {
    const olderRow = included.find((row) => row.transactionDate < openingBalance.cutoffDate);
    if (olderRow) {
      throw new Error(
        `Sao kê có giao dịch trước ngày bắt đầu quản lý (${openingBalance.cutoffDate.toLocaleDateString("vi-VN")}). Hãy chỉ import từ ngày đã chốt trở đi.`,
      );
    }
  }

  const uniqueRows = new Map<string, (typeof parsed.rows)[number]>();
  for (const row of included) {
    if (!uniqueRows.has(row.transactionCode)) {
      uniqueRows.set(row.transactionCode, row);
    }
  }

  return prisma.$transaction(async (tx: TransactionClient) => {
    const accountNumber = parsed.meta.accountNumber;
    const previousAccount = await tx.bankAccount.findUnique({ where: { workspace_accountNumber: { workspace, accountNumber } } });
    const preserveNewerBalance = previousAccount?.balanceAsOf && previousAccount.balanceAsOf > parsed.meta.toDate;
    const account = await tx.bankAccount.upsert({
      where: { workspace_accountNumber: { workspace, accountNumber } },
      update: {
        workspace,
        bankName: parsed.meta.sourceBank,
        currency: parsed.meta.currency,
        accountName: parsed.meta.accountName,
        ...(preserveNewerBalance ? {} : { currentBalance: toPrismaDecimal(parsed.meta.closingBalance ?? 0), balanceAsOf: parsed.meta.toDate }),
      },
      create: {
        workspace,
        bankName: parsed.meta.sourceBank,
        accountNumber,
        currency: parsed.meta.currency,
        accountName: parsed.meta.accountName,
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
        openingBalance: parsed.meta.openingBalance == null ? null : toPrismaDecimal(parsed.meta.openingBalance),
        closingBalance:
          parsed.meta.closingBalance == null ? null : toPrismaDecimal(parsed.meta.closingBalance),
        totalRows: parsed.rows.length,
        excludedRows: excluded.length,
        excludedTransactions: excluded.map(row => ({ ...row, transactionDate: row.transactionDate.toISOString(), reason: "Chuyển số dư BIDV sang ACB; đã tính trong quỹ, không ghi nhận thu lần nữa." })) as unknown as InputJsonObject[],
      },
    });

    const transactionCodes = [...uniqueRows.keys()];
    const existing = await tx.bankTransaction.findMany({
      where: { workspace, transactionCode: { in: transactionCodes } },
      select: { transactionCode: true },
    });
    const existingCodes = new Set(existing.map((item) => item.transactionCode));
    const insertableRows = [...uniqueRows.values()].filter((row) => !existingCodes.has(row.transactionCode));

    const personalReceipt = insertableRows.some(row => parsed.meta.sourceBank === "ACB" && isAcbPersonalReceipt(accountNumber, row));
    const personalCampaign = personalReceipt ? await tx.campaign.findUnique({ where: { workspace_code: { workspace, code: "ca-nhan" } } }) : null;
    if (personalReceipt && !personalCampaign) throw new Error("Không tìm thấy thiện pháp Thu/chi cá nhân để ghi khoản ACB 100.000đ.");
    const data = insertableRows.map((row) => {
      const manualPersonal = personalCampaign && isAcbPersonalReceipt(accountNumber, row);
      const classification = manualPersonal
        ? { campaignId: personalCampaign.id, matchedKeyword: null, status: "MANUAL" as const }
        : classifyDescription(row.description, rules);

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
        accountingType: manualPersonal ? "PERSONAL" as const : "FUND" as const,
        raw: { ...row.raw, ...(manualPersonal ? { classificationSource: "user_confirmed_personal_campaign", note: "Khoản 100.000đ ACB ngày 13/11 được người dùng chỉ định vào Thu/chi cá nhân." } : {}) } as InputJsonObject,
      };
    });

    const created = data.length
      ? await tx.bankTransaction.createMany({
          data,
          skipDuplicates: true,
        })
      : { count: 0 };

    const duplicateRows = included.length - created.count;
    const unmatchedRows = data.filter((row) => row.classificationStatus === "UNMATCHED").length;
    const campaignCodesById = new Map(rules.map((rule) => [rule.campaignId, rule.campaignCode]));
    const affectedCampaignCodes = [
      ...(personalCampaign ? [personalCampaign.code] : []),
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
      excludedRows: excluded.length,
      unmatchedRows,
      accountNumber,
      closingBalance: parsed.meta.closingBalance,
      affectedCampaignCodes,
    } satisfies ImportResult;
  });
}

export async function reclassifyImportedTransactions(workspace: BankWorkspace) {
  const prisma = getPrisma();
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
