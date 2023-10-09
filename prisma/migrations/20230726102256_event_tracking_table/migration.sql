-- CreateTable
CREATE TABLE "LastBeaconSetEventsTracking" (
    "chainId" TEXT NOT NULL,
    "chainName" TEXT NOT NULL,
    "lastEvent" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LastBeaconSetEventsTracking_pkey" PRIMARY KEY ("chainId")
);
