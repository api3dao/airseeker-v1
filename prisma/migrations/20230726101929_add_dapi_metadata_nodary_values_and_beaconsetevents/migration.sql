-- CreateTable
CREATE TABLE "NodaryApiValues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dataFeedId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiValue" DOUBLE PRECISION NOT NULL,
    "nodaryDeviation" DOUBLE PRECISION NOT NULL,
    "providerName" TEXT NOT NULL,

    CONSTRAINT "NodaryApiValues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeaconSetEvents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL,
    "dataFeedId" TEXT NOT NULL,
    "apiValue" DOUBLE PRECISION NOT NULL,
    "chain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodaryDeviation" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BeaconSetEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DApiMetadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "beaconSetId" TEXT,
    "beaconId" TEXT,

    CONSTRAINT "DApiMetadata_pkey" PRIMARY KEY ("id")
);
