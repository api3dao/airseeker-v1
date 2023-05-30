-- CreateEnum
CREATE TYPE "DataFeedType" AS ENUM ('Beacon', 'BeaconSet');

-- CreateTable
CREATE TABLE "DataFeedApiValue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFeedId" TEXT NOT NULL,
    "apiValue" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "type" "DataFeedType" NOT NULL,

    CONSTRAINT "DataFeedApiValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviationValue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFeedId" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DeviationValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataFeedApiValue_dataFeedId_idx" ON "DataFeedApiValue"("dataFeedId");

-- CreateIndex
CREATE INDEX "DeviationValue_dataFeedId_chainId_idx" ON "DeviationValue"("dataFeedId", "chainId");
