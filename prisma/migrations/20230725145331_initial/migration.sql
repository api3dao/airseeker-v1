-- CreateTable
CREATE TABLE "BeaconMetadata" (
    "dataFeedId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,

    CONSTRAINT "BeaconMetadata_pkey" PRIMARY KEY ("dataFeedId")
);

-- CreateTable
CREATE TABLE "BeaconSetMetadata" (
    "dataFeedId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beaconIds" TEXT[],

    CONSTRAINT "BeaconSetMetadata_pkey" PRIMARY KEY ("dataFeedId")
);

-- CreateTable
CREATE TABLE "BeaconSetChildren" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "beaconSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beaconId" TEXT NOT NULL,

    CONSTRAINT "BeaconSetChildren_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFeedApiValue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFeedId" TEXT NOT NULL,
    "apiValue" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "fromNodary" BOOLEAN NOT NULL DEFAULT false,

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

-- CreateTable
CREATE TABLE "WalletBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "walletAddress" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "balance" TEXT NOT NULL,

    CONSTRAINT "WalletBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeaconMetadata_dataFeedId_idx" ON "BeaconMetadata"("dataFeedId");

-- CreateIndex
CREATE INDEX "BeaconMetadata_name_idx" ON "BeaconMetadata"("name");

-- CreateIndex
CREATE INDEX "BeaconMetadata_providerName_idx" ON "BeaconMetadata"("providerName");

-- CreateIndex
CREATE INDEX "BeaconSetMetadata_dataFeedId_idx" ON "BeaconSetMetadata"("dataFeedId");

-- CreateIndex
CREATE INDEX "BeaconSetMetadata_name_idx" ON "BeaconSetMetadata"("name");

-- CreateIndex
CREATE INDEX "DataFeedApiValue_dataFeedId_idx" ON "DataFeedApiValue"("dataFeedId");

-- CreateIndex
CREATE INDEX "DeviationValue_dataFeedId_chainId_idx" ON "DeviationValue"("dataFeedId", "chainId");

-- CreateIndex
CREATE INDEX "WalletBalance_walletAddress_chainId_idx" ON "WalletBalance"("walletAddress", "chainId");
