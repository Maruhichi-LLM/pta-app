-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Ledger" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdByMemberId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "status" "LedgerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" SERIAL NOT NULL,
    "ledgerId" INTEGER NOT NULL,
    "actedByMemberId" INTEGER NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_actedByMemberId_fkey" FOREIGN KEY ("actedByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
