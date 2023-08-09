/*
  Warnings:

  - You are about to drop the column `chain` on the `CompoundValues` table. All the data in the column will be lost.
  - You are about to drop the column `chainId` on the `DeviationValue` table. All the data in the column will be lost.
  - You are about to drop the column `chainId` on the `WalletBalance` table. All the data in the column will be lost.
  - You are about to drop the `LastBeaconSetEventsTracking` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `chainName` to the `CompoundValues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chainName` to the `DeviationValue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `chainName` to the `WalletBalance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `WalletBalance` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "DeviationValue_dataFeedId_chainId_idx";

-- DropIndex
DROP INDEX "WalletBalance_walletAddress_chainId_idx";

-- AlterTable
ALTER TABLE "CompoundValues" RENAME COLUMN "chain" TO "chainName";

-- AlterTable
ALTER TABLE "DeviationValue" RENAME COLUMN "chainId" TO "chainName";

-- AlterTable
ALTER TABLE "WalletBalance" RENAME COLUMN "chainId" TO "chainName";
ALTER TABLE "WalletBalance" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Airseeker';

-- DropTable
DROP TABLE "LastBeaconSetEventsTracking";

-- CreateIndex
CREATE INDEX "DeviationValue_dataFeedId_chainName_idx" ON "DeviationValue"("dataFeedId", "chainName");

-- CreateIndex
CREATE INDEX "WalletBalance_walletAddress_chainName_idx" ON "WalletBalance"("walletAddress", "chainName");
