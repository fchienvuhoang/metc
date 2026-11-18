ALTER TABLE "ImportBatch" ADD COLUMN "excludedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "excludedTransactions" JSONB;

-- Preserve the accounting categories already used by the live database.
-- The guards also support fresh databases from the repository migrations.
DO $$ BEGIN
  CREATE TYPE "TransactionAccountingType" AS ENUM ('FUND', 'PERSONAL', 'INTERNAL_TRANSFER', 'BANK_INTEREST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "accountingType" "TransactionAccountingType" NOT NULL DEFAULT 'FUND';
