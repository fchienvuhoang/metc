-- Preserve existing VIB rows; add the independent BIDV tenant.
ALTER TYPE "BankWorkspace" ADD VALUE IF NOT EXISTS 'BIDV';

-- Natural keys are unique per tenant, never across banks.
CREATE UNIQUE INDEX "BankAccount_workspace_accountNumber_key" ON "BankAccount"("workspace", "accountNumber");
CREATE UNIQUE INDEX "Campaign_workspace_code_key" ON "Campaign"("workspace", "code");
CREATE UNIQUE INDEX "BankTransaction_workspace_transactionCode_key" ON "BankTransaction"("workspace", "transactionCode");
CREATE INDEX "BankTransaction_workspace_transactionDate_idx" ON "BankTransaction"("workspace", "transactionDate");
DROP INDEX "BankAccount_accountNumber_key";
DROP INDEX "Campaign_code_key";
DROP INDEX "BankTransaction_transactionCode_key";
