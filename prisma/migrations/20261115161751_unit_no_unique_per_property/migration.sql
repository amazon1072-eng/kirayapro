-- DropIndex
DROP INDEX "Unit_organizationId_propertyId_unitNo_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Unit_organizationId_propertyId_unitNo_key" ON "Unit"("organizationId", "propertyId", "unitNo");
