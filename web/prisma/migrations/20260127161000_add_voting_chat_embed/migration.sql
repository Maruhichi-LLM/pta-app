-- DropForeignKey
ALTER TABLE "AuditFinding" DROP CONSTRAINT "AuditFinding_createdByMemberId_fkey";

-- AlterTable
ALTER TABLE "AuditFinding" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "actionType" DROP DEFAULT,
ALTER COLUMN "targetType" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "votingId" INTEGER;

-- AlterTable
ALTER TABLE "InternalControlRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TodoItem" ADD COLUMN     "sourceVotingId" INTEGER;

-- AlterTable
ALTER TABLE "Voting" ADD COLUMN     "sourceChatMessageId" INTEGER,
ADD COLUMN     "sourceThreadId" INTEGER;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_votingId_fkey" FOREIGN KEY ("votingId") REFERENCES "Voting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voting" ADD CONSTRAINT "Voting_sourceThreadId_fkey" FOREIGN KEY ("sourceThreadId") REFERENCES "ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voting" ADD CONSTRAINT "Voting_sourceChatMessageId_fkey" FOREIGN KEY ("sourceChatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoItem" ADD CONSTRAINT "TodoItem_sourceVotingId_fkey" FOREIGN KEY ("sourceVotingId") REFERENCES "Voting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
