-- CreateTable
CREATE TABLE "NodaryProvidersFlat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feedName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "NodaryProvidersFlat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodaryProvidersAsArrays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feedName" TEXT NOT NULL,
    "provider" TEXT[],

    CONSTRAINT "NodaryProvidersAsArrays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeaconSetEvents_when_name_idx" ON "BeaconSetEvents"("when", "name");
