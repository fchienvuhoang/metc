CREATE TYPE "BankWorkspace" AS ENUM ('VIB', 'BIDV');

ALTER TABLE "BankAccount" ADD COLUMN "workspace" "BankWorkspace" NOT NULL DEFAULT 'VIB';
ALTER TABLE "ImportBatch" ADD COLUMN "workspace" "BankWorkspace" NOT NULL DEFAULT 'VIB';
ALTER TABLE "Campaign" ADD COLUMN "workspace" "BankWorkspace" NOT NULL DEFAULT 'VIB';
ALTER TABLE "OpeningBalance" ADD COLUMN "workspace" "BankWorkspace" NOT NULL DEFAULT 'VIB';
ALTER TABLE "BankTransaction" ADD COLUMN "workspace" "BankWorkspace" NOT NULL DEFAULT 'VIB';
ALTER TABLE "Expense" ADD COLUMN "workspace" "BankWorkspace" NOT NULL DEFAULT 'VIB';

CREATE UNIQUE INDEX "OpeningBalance_workspace_key" ON "OpeningBalance"("workspace");
CREATE INDEX "BankAccount_workspace_updatedAt_idx" ON "BankAccount"("workspace", "updatedAt");
CREATE INDEX "ImportBatch_workspace_importedAt_idx" ON "ImportBatch"("workspace", "importedAt");
CREATE INDEX "Campaign_workspace_status_createdAt_idx" ON "Campaign"("workspace", "status", "createdAt");
CREATE INDEX "BankTransaction_workspace_transactionDate_idx" ON "BankTransaction"("workspace", "transactionDate");
