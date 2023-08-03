/*
  Warnings:

  - Changed the type of `balance` on the `WalletBalance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "BeaconSetEvents" ADD COLUMN     "children" TEXT[];

-- AlterTable
ALTER TABLE "WalletBalance" DROP COLUMN "balance",
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL;

-- CreateTable
CREATE TABLE "CompoundValues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dapiName" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "dataFeedId" TEXT NOT NULL,
    "onChainValue" DOUBLE PRECISION NOT NULL,
    "offChainValue" DOUBLE PRECISION NOT NULL,
    "onOffChainDeviation" DOUBLE PRECISION NOT NULL,
    "nodaryDeviation" DOUBLE PRECISION NOT NULL,
    "nodaryValue" DOUBLE PRECISION NOT NULL,
    "onChainTimestamp" TIMESTAMP(3) NOT NULL,
    "timestampDelta" INTEGER NOT NULL,

    CONSTRAINT "CompoundValues_pkey" PRIMARY KEY ("id")
);
