export type BankStatementRow = {
  transactionDate: Date;
  statementRow: number;
  description: string;
  transactionCode: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number;
  raw: Record<string, unknown>;
};

export type ParsedBankStatement = {
  meta: {
    sourceBank: "VIB" | "BIDV";
    currency: string;
    accountNumber: string;
    accountName?: string;
    fromDate: Date;
    toDate: Date;
    openingBalance?: number;
    closingBalance: number;
  };
  rows: BankStatementRow[];
};
