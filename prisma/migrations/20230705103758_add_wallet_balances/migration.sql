-- CreateTable
CREATE TABLE "WalletBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "when" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "walletAddress" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WalletBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletBalance_walletAddress_chainId_idx" ON "WalletBalance"("walletAddress", "chainId");
