-- CreateTable
CREATE TABLE "GatewayFailures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "airnodeAddress" TEXT NOT NULL,
    "hashedUrl" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "GatewayFailures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RPCFailures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainName" TEXT NOT NULL,
    "hashedUrl" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RPCFailures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompoundValues_dapiName_idx" ON "CompoundValues"("dapiName");

-- CreateIndex
CREATE INDEX "CompoundValues_when_idx" ON "CompoundValues"("when");
