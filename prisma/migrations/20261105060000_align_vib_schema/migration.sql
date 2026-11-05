-- DropIndex
DROP INDEX "BankAccount_workspace_updatedAt_idx";

-- DropIndex
DROP INDEX "BankTransaction_workspace_transactionDate_idx";

-- DropIndex
DROP INDEX "Campaign_workspace_status_createdAt_idx";

-- DropIndex
DROP INDEX "ImportBatch_workspace_importedAt_idx";

-- AlterTable
ALTER TABLE "BankAccount" ALTER COLUMN "bankName" SET DEFAULT 'VIB';

-- AlterTable
ALTER TABLE "ImportBatch" ALTER COLUMN "sourceLabel" SET DEFAULT 'Sao kê VIB Excel',
ALTER COLUMN "sourceBank" SET DEFAULT 'VIB';

-- RenameIndex
ALTER INDEX "BankTransaction_campaignId_transactionDate_createdAt_statementR" RENAME TO "BankTransaction_campaignId_transactionDate_createdAt_statem_idx";

