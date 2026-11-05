CREATE TABLE "GroupedContribution" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Danh sách hùn phước nộp gộp',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupedContribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "donorName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupedContribution_transactionId_key"
ON "GroupedContribution"("transactionId");

CREATE INDEX "ContributionEntry_batchId_sortOrder_idx"
ON "ContributionEntry"("batchId", "sortOrder");

ALTER TABLE "GroupedContribution"
ADD CONSTRAINT "GroupedContribution_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContributionEntry"
ADD CONSTRAINT "ContributionEntry_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "GroupedContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
