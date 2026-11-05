ALTER TABLE "GroupedContribution"
ALTER COLUMN "title" SET DEFAULT 'Phương danh thí chủ hùn phước';

UPDATE "GroupedContribution"
SET "title" = 'Phương danh thí chủ hùn phước',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Danh sách hùn phước nộp gộp';
