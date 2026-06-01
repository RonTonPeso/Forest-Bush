-- Add environments to feature flags while preserving existing flags as production.
ALTER TABLE "FeatureFlag" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';

DROP INDEX IF EXISTS "FeatureFlag_key_key";

CREATE UNIQUE INDEX "FeatureFlag_key_environment_key" ON "FeatureFlag"("key", "environment");
