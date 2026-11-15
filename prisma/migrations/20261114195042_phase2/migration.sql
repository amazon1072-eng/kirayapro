-- CreateTable
CREATE TABLE "Union" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "presidentName" TEXT,
    "presidentPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "registrationNo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Union_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnionMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cnic" TEXT,
    "unitId" TEXT,
    "tenantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "joinedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnionMember_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnionMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnionMember_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UnionMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnionFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnionFee_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnionFee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnionFeeCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "paidDate" DATETIME,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnionFeeCollection_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnionFeeCollection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "UnionMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnionFeeCollection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnionExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "vendor" TEXT,
    "invoicePath" TEXT,
    "invoiceName" TEXT,
    "spentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnionExpense_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnionExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "relatedId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissionsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "billId" TEXT,
    "tenantId" TEXT,
    "phone" TEXT NOT NULL,
    "templateName" TEXT,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "managementTypes" TEXT NOT NULL DEFAULT '[]',
    "city" TEXT,
    "address" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'Starter',
    "trialEndsAt" DATETIME,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "receiptCounter" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Organization" ("address", "city", "contactName", "contactPhone", "createdAt", "id", "isDemo", "managementTypes", "name", "plan", "receiptCounter", "updatedAt") SELECT "address", "city", "contactName", "contactPhone", "createdAt", "id", "isDemo", "managementTypes", "name", "plan", "receiptCounter", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE INDEX "Organization_isDemo_idx" ON "Organization"("isDemo");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "customRoleId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "fullName", "id", "organizationId", "passwordHash", "phone", "role", "updatedAt") SELECT "createdAt", "email", "fullName", "id", "organizationId", "passwordHash", "phone", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "User_email_idx" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Union_organizationId_idx" ON "Union"("organizationId");

-- CreateIndex
CREATE INDEX "UnionMember_organizationId_idx" ON "UnionMember"("organizationId");

-- CreateIndex
CREATE INDEX "UnionMember_unionId_idx" ON "UnionMember"("unionId");

-- CreateIndex
CREATE UNIQUE INDEX "UnionMember_unionId_membershipNo_key" ON "UnionMember"("unionId", "membershipNo");

-- CreateIndex
CREATE INDEX "UnionFee_organizationId_idx" ON "UnionFee"("organizationId");

-- CreateIndex
CREATE INDEX "UnionFee_unionId_idx" ON "UnionFee"("unionId");

-- CreateIndex
CREATE INDEX "UnionFeeCollection_organizationId_idx" ON "UnionFeeCollection"("organizationId");

-- CreateIndex
CREATE INDEX "UnionFeeCollection_unionId_billingPeriod_idx" ON "UnionFeeCollection"("unionId", "billingPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "UnionFeeCollection_memberId_billingPeriod_key" ON "UnionFeeCollection"("memberId", "billingPeriod");

-- CreateIndex
CREATE INDEX "UnionExpense_organizationId_idx" ON "UnionExpense"("organizationId");

-- CreateIndex
CREATE INDEX "UnionExpense_unionId_idx" ON "UnionExpense"("unionId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_isRead_idx" ON "Notification"("organizationId", "isRead");

-- CreateIndex
CREATE INDEX "CustomRole_organizationId_idx" ON "CustomRole"("organizationId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_idx" ON "WhatsAppMessage"("organizationId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_billId_idx" ON "WhatsAppMessage"("billId");
