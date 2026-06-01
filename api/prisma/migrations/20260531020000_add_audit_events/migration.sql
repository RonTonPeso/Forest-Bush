CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_flagKey_environment_createdAt_idx" ON "AuditEvent"("flagKey", "environment", "createdAt");
