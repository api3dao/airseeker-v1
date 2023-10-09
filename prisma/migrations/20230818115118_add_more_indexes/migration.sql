-- CreateIndex
CREATE INDEX "NodaryProvidersFlat_provider_idx" ON "NodaryProvidersFlat"("provider");

-- CreateIndex
CREATE INDEX "NodaryProvidersFlat_feedName_idx" ON "NodaryProvidersFlat"("feedName");

-- CreateIndex
CREATE INDEX "NodaryProvidersFlat_provider_feedName_idx" ON "NodaryProvidersFlat"("provider", "feedName");
