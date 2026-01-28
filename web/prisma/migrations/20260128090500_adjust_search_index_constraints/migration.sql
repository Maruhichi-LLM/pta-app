-- DropForeignKey
ALTER TABLE "AuditFinding" DROP CONSTRAINT "AuditFinding_createdByMemberId_fkey";

-- DropForeignKey
ALTER TABLE "SearchIndex" DROP CONSTRAINT "SearchIndex_groupId_fkey";

-- AlterTable
ALTER TABLE "AuditFinding" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "actionType" DROP DEFAULT,
ALTER COLUMN "targetType" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InternalControlRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SearchIndex" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchIndex" ADD CONSTRAINT "SearchIndex_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
