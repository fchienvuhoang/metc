CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL DEFAULT 'system-opening-balance',
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "bankBalance" DECIMAL(18,2) NOT NULL,
    "unallocatedBalance" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpeningBalanceAllocation" (
    "id" TEXT NOT NULL,
    "openingBalanceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "OpeningBalanceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpeningBalanceAllocation_campaignId_key" ON "OpeningBalanceAllocation"("campaignId");
CREATE INDEX "OpeningBalanceAllocation_openingBalanceId_idx" ON "OpeningBalanceAllocation"("openingBalanceId");

ALTER TABLE "OpeningBalanceAllocation" ADD CONSTRAINT "OpeningBalanceAllocation_openingBalanceId_fkey"
FOREIGN KEY ("openingBalanceId") REFERENCES "OpeningBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OpeningBalanceAllocation" ADD CONSTRAINT "OpeningBalanceAllocation_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
