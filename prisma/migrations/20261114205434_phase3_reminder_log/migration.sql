-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "billId" TEXT,
    "tenantId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReminderLog_organizationId_type_billId_idx" ON "ReminderLog"("organizationId", "type", "billId");

-- CreateIndex
CREATE INDEX "ReminderLog_organizationId_tenantId_idx" ON "ReminderLog"("organizationId", "tenantId");
