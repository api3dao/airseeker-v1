/*
  Warnings:

  - You are about to drop the column `provider` on the `DataFeedIdMapping` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DataFeedApiValue" ALTER COLUMN "apiValue" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "DataFeedIdMapping" DROP COLUMN "provider",
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "WalletBalance" ALTER COLUMN "balance" SET DATA TYPE TEXT;
