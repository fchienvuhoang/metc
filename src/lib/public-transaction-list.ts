import type { PublicCampaignTransaction } from "@/lib/public-campaign";

// This transfer represents the old account statement, rather than a new donation.
const OLD_BIDV_STATEMENT_TRANSFER = "cmwa0kep6000207jmlg9ea915";

export function publicTransactionList(transactions: PublicCampaignTransaction[]): PublicCampaignTransaction[] {
  return transactions.flatMap((transaction) => {
    if (transaction.id !== OLD_BIDV_STATEMENT_TRANSFER || !transaction.groupedContribution) return [transaction];

    return transaction.groupedContribution.entries.map((entry, index) => {
      const match = entry.note?.match(/^Ngày giao dịch gốc: (\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);
      const date = match ? new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}+07:00`) : null;
      return {
        ...transaction,
        id: entry.id,
        transactionDate: date && Number.isFinite(date.getTime()) ? date.toISOString() : transaction.transactionDate,
        statementRow: index + 1,
        description: entry.donorName,
        transactionCode: `${transaction.transactionCode}/${index + 1}`,
        creditAmount: entry.amount,
        debitAmount: 0,
        groupedContribution: null,
      };
    });
  });
}
