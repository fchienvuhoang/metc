DROP TYPE IF EXISTS "BankWorkspace_new";
CREATE TYPE "BankWorkspace_new" AS ENUM ('VIB');

ALTER TABLE "BankAccount" ALTER COLUMN "workspace" DROP DEFAULT;
ALTER TABLE "ImportBatch" ALTER COLUMN "workspace" DROP DEFAULT;
ALTER TABLE "Campaign" ALTER COLUMN "workspace" DROP DEFAULT;
ALTER TABLE "OpeningBalance" ALTER COLUMN "workspace" DROP DEFAULT;
ALTER TABLE "BankTransaction" ALTER COLUMN "workspace" DROP DEFAULT;
ALTER TABLE "Expense" ALTER COLUMN "workspace" DROP DEFAULT;

ALTER TABLE "BankAccount" ALTER COLUMN "workspace" TYPE "BankWorkspace_new" USING ("workspace"::text::"BankWorkspace_new");
ALTER TABLE "ImportBatch" ALTER COLUMN "workspace" TYPE "BankWorkspace_new" USING ("workspace"::text::"BankWorkspace_new");
ALTER TABLE "Campaign" ALTER COLUMN "workspace" TYPE "BankWorkspace_new" USING ("workspace"::text::"BankWorkspace_new");
ALTER TABLE "OpeningBalance" ALTER COLUMN "workspace" TYPE "BankWorkspace_new" USING ("workspace"::text::"BankWorkspace_new");
ALTER TABLE "BankTransaction" ALTER COLUMN "workspace" TYPE "BankWorkspace_new" USING ("workspace"::text::"BankWorkspace_new");
ALTER TABLE "Expense" ALTER COLUMN "workspace" TYPE "BankWorkspace_new" USING ("workspace"::text::"BankWorkspace_new");

DROP TYPE "BankWorkspace";
ALTER TYPE "BankWorkspace_new" RENAME TO "BankWorkspace";

ALTER TABLE "BankAccount" ALTER COLUMN "workspace" SET DEFAULT 'VIB';
ALTER TABLE "ImportBatch" ALTER COLUMN "workspace" SET DEFAULT 'VIB';
ALTER TABLE "Campaign" ALTER COLUMN "workspace" SET DEFAULT 'VIB';
ALTER TABLE "BankTransaction" ALTER COLUMN "workspace" SET DEFAULT 'VIB';
ALTER TABLE "Expense" ALTER COLUMN "workspace" SET DEFAULT 'VIB';
