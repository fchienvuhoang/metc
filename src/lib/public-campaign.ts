import type { BankWorkspace } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { decimalToNumber } from "@/lib/money";
import { getPrisma, retryTransientDatabaseRead } from "@/lib/prisma";
import { makeCampaignCode } from "@/lib/text";

export type PublicCampaignData = {
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  targetAmount: number | null;
  income: number;
  expenses: number;
  balance: number;
  transactionCount: number;
  monthlyExpenses: PublicCampaignMonthlyExpense[];
  transactions: PublicCampaignTransaction[];
};

export type PublicCampaignMonthlyExpense = {
  month: string;
  incomeTransactionCount: number;
  incomeAmount: number;
  transactionCount: number;
  amount: number;
  transactions: PublicCampaignExpenseTransaction[];
};

export type PublicCampaignExpenseTransaction = {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
};

export type PublicCampaignTransaction = {
  id: string;
  transactionDate: string;
  createdAt: string;
  statementRow: number | null;
  description: string;
  transactionCode: string;
  debitAmount: number;
  creditAmount: number;
  groupedContribution: {
    title: string;
    note: string | null;
    entries: {
      id: string;
      donorName: string;
      amount: number;
      note: string | null;
    }[];
  } | null;
};

export type PublicCampaignListItem = {
  code: string;
  name: string;
  description: string | null;
};

const PUBLIC_CAMPAIGN_LIST_TAG = "public-campaign-list";
const MONTHLY_EXPENSE_CAMPAIGN_CODES = new Set(["quy-hang-thang", "quy-nhom-1"]);

export async function getPublicCampaignList(workspace: BankWorkspace = "VIB"): Promise<PublicCampaignListItem[]> {
  const prisma = getPrisma();
  return retryTransientDatabaseRead(() => prisma.campaign.findMany({
    where: {
      workspace,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
    select: {
      code: true,
      name: true,
      description: true,
    },
  }));
}

export function getCachedPublicCampaignList(workspace: BankWorkspace = "VIB") {
  return unstable_cache(
    () => getPublicCampaignList(workspace),
    ["public-campaign-list", workspace],
    { revalidate: false, tags: [`${PUBLIC_CAMPAIGN_LIST_TAG}:${workspace}`] },
  )();
}

export async function getPublicCampaignMeta(code: string, workspace: BankWorkspace = "VIB") {
  const prisma = getPrisma();
  const normalizedCode = makeCampaignCode(code);

  return retryTransientDatabaseRead(() => prisma.campaign.findUnique({
    where: { workspace_code: { workspace, code: normalizedCode } },
    select: {
      code: true,
      name: true,
      description: true,
    },
  }));
}

function publicCampaignMetaTag(code: string, workspace: BankWorkspace) {
  return `public-campaign-meta:${workspace}:${makeCampaignCode(code)}`;
}

function publicCampaignDataTag(code: string, workspace: BankWorkspace) {
  return `public-campaign-data:${workspace}:${makeCampaignCode(code)}`;
}

export function getCachedPublicCampaignMeta(code: string, workspace: BankWorkspace = "VIB") {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignMeta(normalizedCode, workspace),
    ["public-campaign-meta", workspace, normalizedCode],
    { revalidate: false, tags: [publicCampaignMetaTag(normalizedCode, workspace)] },
  )();
}

export async function getPublicCampaignData(code: string, workspace: BankWorkspace = "VIB"): Promise<PublicCampaignData | null> {
  return retryTransientDatabaseRead(() => loadPublicCampaignData(code, workspace));
}

async function loadPublicCampaignData(code: string, workspace: BankWorkspace = "VIB"): Promise<PublicCampaignData | null> {
  const prisma = getPrisma();
  const normalizedCode = makeCampaignCode(code);
  const campaign = await prisma.campaign.findUnique({
    where: { workspace_code: { workspace, code: normalizedCode } },
    select: {
      id: true,
      targetAmount: true,
      code: true,
      name: true,
      description: true,
      status: true,
    },
  });

  if (!campaign) {
    return null;
  }

  const hasMonthlyExpenseStatistics = MONTHLY_EXPENSE_CAMPAIGN_CODES.has(campaign.code);

  const [transactionSums, transactions, monthlyTransactions, openingAllocation, allocatedTransactions, groupedContributionBatches] = await Promise.all([
    prisma.bankTransaction.aggregate({
      where: {
        workspace,
        campaignId: campaign.id,
      },
      _sum: {
        creditAmount: true,
        debitAmount: true,
      },
      _count: true,
    }),
    prisma.bankTransaction.findMany({
      where: {
        workspace,
        campaignId: campaign.id,
      },
      select: {
        id: true,
        transactionDate: true,
        createdAt: true,
        statementRow: true,
        description: true,
        transactionCode: true,
        debitAmount: true,
        creditAmount: true,
        groupedContribution: {
          select: {
            title: true,
            note: true,
            entries: {
              select: { id: true, donorName: true, amount: true, note: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
      take: 1000,
    }),
    hasMonthlyExpenseStatistics
      ? prisma.bankTransaction.findMany({
          where: {
            workspace,
            campaignId: campaign.id,
            OR: [
              { creditAmount: { gt: 0 } },
              { debitAmount: { gt: 0 } },
            ],
          },
          select: {
            id: true,
            transactionDate: true,
            description: true,
            debitAmount: true,
            creditAmount: true,
          },
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
        })
      : Promise.resolve([]),
    prisma.openingBalanceAllocation.findUnique({
      where: { campaignId: campaign.id },
      select: { amount: true },
    }),
    prisma.transactionAllocation.findMany({
      where: { campaignId: campaign.id, transaction: { workspace } },
      select: {
        amount: true,
        transaction: {
          select: {
            id: true,
            transactionDate: true,
            createdAt: true,
            statementRow: true,
            description: true,
            transactionCode: true,
            debitAmount: true,
            creditAmount: true,
          },
        },
      },
      orderBy: { transaction: { transactionDate: "desc" } },
    }),
    prisma.groupedContribution.findMany({
      where: { transaction: { workspace, campaignId: campaign.id, creditAmount: { gt: 0 } } },
      select: { _count: { select: { entries: true } } },
    }),
  ]);

  const allocatedIncome = allocatedTransactions.reduce((sum, item) =>
    decimalToNumber(item.transaction.creditAmount) > 0 ? sum + decimalToNumber(item.amount) : sum, 0);
  const allocatedExpenses = allocatedTransactions.reduce((sum, item) =>
    decimalToNumber(item.transaction.debitAmount) > 0 ? sum + decimalToNumber(item.amount) : sum, 0);
  const income = decimalToNumber(transactionSums._sum.creditAmount) + allocatedIncome;
  const expenses = decimalToNumber(transactionSums._sum.debitAmount) + allocatedExpenses;
  const openingBalance = decimalToNumber(openingAllocation?.amount);
  const monthlyExpenseMap = new Map<string, PublicCampaignMonthlyExpense>();

  for (const transaction of monthlyTransactions) {
    const month = transactionMonth(transaction.transactionDate);
    const current = monthlyExpenseMap.get(month) ?? {
      month,
      incomeTransactionCount: 0,
      incomeAmount: 0,
      transactionCount: 0,
      amount: 0,
      transactions: [],
    };
    const creditAmount = decimalToNumber(transaction.creditAmount);
    const debitAmount = decimalToNumber(transaction.debitAmount);
    if (creditAmount > 0) {
      current.incomeTransactionCount += 1;
      current.incomeAmount += creditAmount;
    }
    if (debitAmount > 0) {
      current.transactionCount += 1;
      current.amount += debitAmount;
      current.transactions.push({
        id: transaction.id,
        transactionDate: transaction.transactionDate.toISOString(),
        description: transaction.description,
        amount: debitAmount,
      });
    }
    monthlyExpenseMap.set(month, current);
  }

  for (const allocation of allocatedTransactions) {
    const transaction = allocation.transaction;
    const creditAmount = decimalToNumber(transaction.creditAmount);
    const debitAmount = decimalToNumber(transaction.debitAmount);
    if (creditAmount <= 0 && debitAmount <= 0) continue;
    const month = transactionMonth(transaction.transactionDate);
    const current = monthlyExpenseMap.get(month) ?? {
      month,
      incomeTransactionCount: 0,
      incomeAmount: 0,
      transactionCount: 0,
      amount: 0,
      transactions: [],
    };
    const amount = decimalToNumber(allocation.amount);
    if (creditAmount > 0) {
      current.incomeTransactionCount += 1;
      current.incomeAmount += amount;
    }
    if (debitAmount > 0) {
      current.transactionCount += 1;
      current.amount += amount;
      current.transactions.push({
        id: `${transaction.id}-${campaign.id}`,
        transactionDate: transaction.transactionDate.toISOString(),
        description: transaction.description,
        amount,
      });
    }
    monthlyExpenseMap.set(month, current);
  }

  if (hasMonthlyExpenseStatistics) {
    const currentMonth = transactionMonth(new Date());
    if (!monthlyExpenseMap.has(currentMonth)) {
      monthlyExpenseMap.set(currentMonth, {
        month: currentMonth,
        incomeTransactionCount: 0,
        incomeAmount: 0,
        transactionCount: 0,
        amount: 0,
        transactions: [],
      });
    }
  }

  return {
    code: campaign.code,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    targetAmount: campaign.targetAmount == null ? null : decimalToNumber(campaign.targetAmount),
    income,
    expenses,
    balance: openingBalance + income - expenses,
    transactionCount:
      transactionSums._count
      + allocatedTransactions.length
      + groupedContributionBatches.reduce((sum, batch) => sum + batch._count.entries - 1, 0),
    monthlyExpenses: [...monthlyExpenseMap.values()].sort((left, right) => right.month.localeCompare(left.month)),
    transactions: [
      ...transactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      statementRow: transaction.statementRow,
      description: transaction.description,
      transactionCode: transaction.transactionCode,
      debitAmount: decimalToNumber(transaction.debitAmount),
      creditAmount: decimalToNumber(transaction.creditAmount),
      groupedContribution: transaction.groupedContribution
        ? {
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
      ...allocatedTransactions.map(({ transaction, amount }) => ({
        id: `${transaction.id}-${campaign.id}`,
        transactionDate: transaction.transactionDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        statementRow: transaction.statementRow,
        description: transaction.description,
        transactionCode: transaction.transactionCode,
        debitAmount: decimalToNumber(transaction.debitAmount) > 0 ? decimalToNumber(amount) : 0,
        creditAmount: decimalToNumber(transaction.creditAmount) > 0 ? decimalToNumber(amount) : 0,
        groupedContribution: null,
      })),
    ],
  };
}

function transactionMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function getCachedPublicCampaignData(code: string, workspace: BankWorkspace = "VIB") {
  const normalizedCode = makeCampaignCode(code);
  return unstable_cache(
    () => getPublicCampaignData(normalizedCode, workspace),
    ["public-campaign-data-v12", workspace, normalizedCode],
    { revalidate: false, tags: [publicCampaignDataTag(normalizedCode, workspace)] },
  )();
}

export function invalidatePublicCampaignCache(codes: Iterable<string | null | undefined>, workspace: BankWorkspace = "VIB") {
  const normalizedCodes = new Set(
    [...codes].filter((code): code is string => Boolean(code)).map(makeCampaignCode),
  );

  for (const code of normalizedCodes) {
    revalidateTag(publicCampaignDataTag(code, workspace), { expire: 0 });
  }

  return [...normalizedCodes];
}

export function invalidatePublicCampaignDefinitionCache(codes: Iterable<string | null | undefined>, workspace: BankWorkspace = "VIB") {
  const normalizedCodes = invalidatePublicCampaignCache(codes, workspace);
  for (const code of normalizedCodes) {
    revalidateTag(publicCampaignMetaTag(code, workspace), { expire: 0 });
  }
  revalidateTag(`${PUBLIC_CAMPAIGN_LIST_TAG}:${workspace}`, { expire: 0 });
  return normalizedCodes;
}

export async function warmPublicCampaignCaches(codes: Iterable<string>, workspace: BankWorkspace = "VIB") {
  const normalizedCodes = [...new Set([...codes].map(makeCampaignCode))];
  await Promise.all(normalizedCodes.map((code) => getCachedPublicCampaignData(code, workspace)));
}

export async function warmPublicCampaignDefinitionCaches(codes: Iterable<string>, workspace: BankWorkspace = "VIB") {
  const normalizedCodes = [...new Set([...codes].map(makeCampaignCode))];
  await Promise.all([
    getCachedPublicCampaignList(workspace),
    ...normalizedCodes.flatMap((code) => [
      getCachedPublicCampaignMeta(code, workspace),
      getCachedPublicCampaignData(code, workspace),
    ]),
  ]);
}
