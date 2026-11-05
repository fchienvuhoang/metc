import { decimalToNumber } from "@/lib/money";
import type { BankWorkspace } from "@prisma/client";
import {
  DatabaseNotConfiguredError,
  getPrisma,
  isTransientDatabaseError,
  retryTransientDatabaseRead,
} from "@/lib/prisma";

export type DashboardState =
  | {
      ok: true;
      data: DashboardData;
    }
  | {
      ok: false;
      reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_ERROR";
      message: string;
    };

export type DashboardData = {
  workspace: BankWorkspace;
  overview: {
    totalIncome: number;
    totalDebit: number;
    totalExpenses: number;
    trackedFundBalance: number;
    bankBalance: number;
    transactionCount: number;
    unmatchedCount: number;
    unmatchedIncome: number;
    unmatchedDebit: number;
  };
  bankAccount: {
    accountNumber: string;
    accountName: string | null;
    bankName: string;
    currency: string;
    currentBalance: number;
    balanceAsOf: string | null;
  } | null;
  campaigns: CampaignSummary[];
  transactions: TransactionSummary[];
  debitTransactions: TransactionSummary[];
  latestImport: {
    sourceLabel: string;
    importedAt: string;
    totalRows: number;
    insertedRows: number;
    duplicateRows: number;
    unmatchedRows: number;
  } | null;
  openingBalance: {
    cutoffDate: string;
    bankBalance: number;
    unallocatedBalance: number;
    note: string | null;
    createdAt: string;
  } | null;
};

export type CampaignSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  income: number;
  debit: number;
  expenses: number;
  balance: number;
  openingBalance: number;
  transactionCount: number;
  keywords: {
    id: string;
    keyword: string;
    normalizedKeyword: string;
    matchType: "CONTAINS" | "EXACT" | "REGEX";
    active: boolean;
  }[];
};

export type TransactionSummary = {
  id: string;
  transactionDate: string;
  createdAt: string;
  statementRow: number | null;
  description: string;
  transactionCode: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number | null;
  matchedKeyword: string | null;
  classificationStatus: "MATCHED" | "UNMATCHED" | "MANUAL";
  campaign: {
    id: string;
    code: string;
    name: string;
  } | null;
  allocations: {
    campaignId: string;
    amount: number;
    campaign: { id: string; code: string; name: string };
  }[];
  groupedContribution: {
    id: string;
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

export async function getDashboardState(workspace: BankWorkspace): Promise<DashboardState> {
  try {
    return await retryTransientDatabaseRead(() => loadDashboardState(workspace));
  } catch (error) {
    return {
      ok: false,
      reason: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "Không đọc được dữ liệu dashboard.",
    };
  }
}

async function loadDashboardState(workspace: BankWorkspace): Promise<DashboardState> {
  try {
    const prisma = getPrisma();

    const [
      campaigns,
      transactionSums,
      overallTransactionSums,
      unmatchedIncome,
      unmatchedDebit,
      unmatchedTransactionCount,
      transactions,
      debitTransactions,
      bankAccount,
      latestImport,
      openingBalance,
      transactionAllocations,
    ] = await Promise.all([
      prisma.campaign.findMany({
        where: { workspace },
        include: {
          keywords: {
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: {
              transactions: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
      prisma.bankTransaction.groupBy({
        by: ["campaignId"],
        where: { workspace },
        _sum: {
          creditAmount: true,
          debitAmount: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.bankTransaction.aggregate({
        where: { workspace },
        _sum: {
          creditAmount: true,
          debitAmount: true,
        },
        _count: true,
      }),
      prisma.bankTransaction.aggregate({
        where: {
          workspace,
          campaignId: null,
          allocations: { none: {} },
          creditAmount: {
            gt: 0,
          },
        },
        _sum: {
          creditAmount: true,
        },
        _count: true,
      }),
      prisma.bankTransaction.aggregate({
        where: {
          workspace,
          campaignId: null,
          allocations: { none: {} },
          debitAmount: {
            gt: 0,
          },
        },
        _sum: {
          debitAmount: true,
        },
        _count: true,
      }),
      prisma.bankTransaction.count({
        where: {
          workspace,
          campaignId: null,
          allocations: { none: {} },
        },
      }),
      prisma.bankTransaction.findMany({
        where: { workspace },
        include: {
          campaign: {
            select: {
              id: true,
              code: true,
              name: true,
            },
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
        take: 50,
      }),
      prisma.bankTransaction.findMany({
        where: {
          workspace,
          debitAmount: {
            gt: 0,
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
          allocations: {
            include: { campaign: { select: { id: true, code: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
          groupedContribution: {
            include: { entries: { orderBy: { sortOrder: "asc" } } },
          },
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { statementRow: "desc" }],
        take: 500,
      }),
      prisma.bankAccount.findFirst({
        where: { workspace },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.importBatch.findFirst({
        where: { workspace },
        orderBy: { importedAt: "desc" },
      }),
      prisma.openingBalance.findUnique({
        where: { workspace },
        include: { allocations: true },
      }),
      prisma.transactionAllocation.findMany({
        where: { transaction: { workspace } },
        select: {
          transactionId: true,
          campaignId: true,
          amount: true,
          transaction: { select: { creditAmount: true, debitAmount: true } },
        },
      }),
    ]);

    const txByCampaign = new Map(
      transactionSums.map((item) => [
        item.campaignId,
        {
          income: decimalToNumber(item._sum.creditAmount),
          debit: decimalToNumber(item._sum.debitAmount),
          count: item._count._all,
        },
      ]),
    );

    const allocatedTransactionIdsByCampaign = new Map<string, Set<string>>();
    for (const allocation of transactionAllocations) {
      const current = txByCampaign.get(allocation.campaignId) ?? { income: 0, debit: 0, count: 0 };
      const amount = decimalToNumber(allocation.amount);
      if (decimalToNumber(allocation.transaction.creditAmount) > 0) current.income += amount;
      if (decimalToNumber(allocation.transaction.debitAmount) > 0) current.debit += amount;
      txByCampaign.set(allocation.campaignId, current);

      const ids = allocatedTransactionIdsByCampaign.get(allocation.campaignId) ?? new Set<string>();
      ids.add(allocation.transactionId);
      allocatedTransactionIdsByCampaign.set(allocation.campaignId, ids);
    }

    const campaignSummaries = campaigns.map((campaign) => {
      const tx = txByCampaign.get(campaign.id);
      const income = tx?.income ?? 0;
      const debit = tx?.debit ?? 0;
      const expensesAmount = debit;
      const initialAmount = decimalToNumber(
        openingBalance?.allocations.find((allocation) => allocation.campaignId === campaign.id)?.amount,
      );

      return {
        id: campaign.id,
        code: campaign.code,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        income,
        debit,
        expenses: expensesAmount,
        openingBalance: initialAmount,
        balance: initialAmount + income - expensesAmount,
        transactionCount: campaign._count.transactions + (allocatedTransactionIdsByCampaign.get(campaign.id)?.size ?? 0),
        keywords: campaign.keywords.map((keyword) => ({
          id: keyword.id,
          keyword: keyword.keyword,
          normalizedKeyword: keyword.normalizedKeyword,
          matchType: keyword.matchType,
          active: keyword.active,
        })),
      } satisfies CampaignSummary;
    });

    const totalIncome = decimalToNumber(overallTransactionSums._sum.creditAmount);
    const totalDebit = decimalToNumber(overallTransactionSums._sum.debitAmount);
    const totalExpenses = totalDebit;

    return {
      ok: true,
      data: {
        workspace,
        overview: {
          totalIncome,
          totalDebit,
          totalExpenses,
          trackedFundBalance: campaignSummaries.reduce((sum, campaign) => sum + campaign.balance, 0),
          bankBalance: decimalToNumber(bankAccount?.currentBalance),
          transactionCount: overallTransactionSums._count,
          unmatchedCount: unmatchedTransactionCount,
          unmatchedIncome: decimalToNumber(unmatchedIncome._sum.creditAmount),
          unmatchedDebit: decimalToNumber(unmatchedDebit._sum.debitAmount),
        },
        bankAccount: bankAccount
          ? {
              accountNumber: bankAccount.accountNumber,
              accountName: bankAccount.accountName,
              bankName: bankAccount.bankName,
              currency: bankAccount.currency,
              currentBalance: decimalToNumber(bankAccount.currentBalance),
              balanceAsOf: bankAccount.balanceAsOf?.toISOString() ?? null,
            }
          : null,
        campaigns: campaignSummaries,
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
        debitTransactions: debitTransactions.map((transaction) => ({
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
        latestImport: latestImport
          ? {
              sourceLabel: latestImport.sourceLabel,
              importedAt: latestImport.importedAt.toISOString(),
              totalRows: latestImport.totalRows,
              insertedRows: latestImport.insertedRows,
              duplicateRows: latestImport.duplicateRows,
              unmatchedRows: latestImport.unmatchedRows,
            }
          : null,
        openingBalance: openingBalance
          ? {
              cutoffDate: openingBalance.cutoffDate.toISOString(),
              bankBalance: decimalToNumber(openingBalance.bankBalance),
              unallocatedBalance: decimalToNumber(openingBalance.unallocatedBalance),
              note: openingBalance.note,
              createdAt: openingBalance.createdAt.toISOString(),
            }
          : null,
      },
    };
  } catch (error) {
    if (isTransientDatabaseError(error)) throw error;
    if (error instanceof DatabaseNotConfiguredError) {
      return {
        ok: false,
        reason: "DATABASE_NOT_CONFIGURED",
        message: "DATABASE_URL chưa được cấu hình.",
      };
    }

    return {
      ok: false,
      reason: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "Không đọc được dữ liệu dashboard.",
    };
  }
}
