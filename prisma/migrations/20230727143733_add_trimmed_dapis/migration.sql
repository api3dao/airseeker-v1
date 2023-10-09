-- CreateTable
CREATE TABLE "TrimmedDApi" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "dataFeedId" TEXT NOT NULL,
    "isBeaconSet" BOOLEAN NOT NULL,
    "category" TEXT NOT NULL,
    "chainName" TEXT NOT NULL,
    "supplierCategory" TEXT NOT NULL,
    "fundingStatus" TEXT NOT NULL,
    "displayOnMarket" BOOLEAN NOT NULL,
    "isNewListing" BOOLEAN NOT NULL,
    "estimatedExpiry" TIMESTAMP(3),
    "managedAvailable" BOOLEAN NOT NULL,
    "upgradeStatus" TEXT NOT NULL,

    CONSTRAINT "TrimmedDApi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrimmedDApi_name_chainName_key" ON "TrimmedDApi"("name", "chainName");
