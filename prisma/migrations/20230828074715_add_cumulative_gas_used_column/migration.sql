-- DropIndex
DROP INDEX "BeaconSetEvents_when_name_chain_dataFeedId_idx";

-- DropIndex
DROP INDEX "NodaryProvidersFlat_feedName_idx";

-- DropIndex
DROP INDEX "NodaryProvidersFlat_provider_feedName_idx";

-- DropIndex
DROP INDEX "NodaryProvidersFlat_provider_idx";

-- AlterTable
ALTER TABLE "BeaconSetEvents" ADD COLUMN     "cumulativeGasUsed" DOUBLE PRECISION;
