-- CreateEnum
CREATE TYPE "EventBudgetStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'CONFIRMED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "EventTransactionType" AS ENUM ('REVENUE', 'EXPENSE');

-- AlterTable
ALTER TABLE "Ledger" ADD COLUMN     "eventBudgetId" INTEGER;

-- CreateTable
CREATE TABLE "EventBudget" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "plannedRevenue" INTEGER NOT NULL DEFAULT 0,
    "plannedExpense" INTEGER NOT NULL DEFAULT 0,
    "actualRevenue" INTEGER NOT NULL DEFAULT 0,
    "actualExpense" INTEGER NOT NULL DEFAULT 0,
    "status" "EventBudgetStatus" NOT NULL DEFAULT 'PLANNING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" INTEGER,
    "importedToLedgerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTransaction" (
    "id" SERIAL NOT NULL,
    "eventBudgetId" INTEGER NOT NULL,
    "type" "EventTransactionType" NOT NULL,
    "categoryId" INTEGER,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "createdByMemberId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTransactionCategory" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EventTransactionType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTransactionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventBudgetImport" (
    "id" SERIAL NOT NULL,
    "eventBudgetId" INTEGER NOT NULL,
    "importedByMemberId" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ledgerEntryCount" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "EventBudgetImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventBudget_eventId_key" ON "EventBudget"("eventId");

-- CreateIndex
CREATE INDEX "EventBudget_groupId_idx" ON "EventBudget"("groupId");

-- CreateIndex
CREATE INDEX "EventBudget_eventId_idx" ON "EventBudget"("eventId");

-- CreateIndex
CREATE INDEX "EventTransaction_eventBudgetId_idx" ON "EventTransaction"("eventBudgetId");

-- CreateIndex
CREATE INDEX "EventTransaction_categoryId_idx" ON "EventTransaction"("categoryId");

-- CreateIndex
CREATE INDEX "EventTransactionCategory_groupId_idx" ON "EventTransactionCategory"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTransactionCategory_groupId_name_type_key" ON "EventTransactionCategory"("groupId", "name", "type");

-- CreateIndex
CREATE INDEX "EventBudgetImport_eventBudgetId_idx" ON "EventBudgetImport"("eventBudgetId");

-- CreateIndex
CREATE INDEX "Ledger_eventBudgetId_idx" ON "Ledger"("eventBudgetId");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_eventBudgetId_fkey" FOREIGN KEY ("eventBudgetId") REFERENCES "EventBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBudget" ADD CONSTRAINT "EventBudget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBudget" ADD CONSTRAINT "EventBudget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBudget" ADD CONSTRAINT "EventBudget_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTransaction" ADD CONSTRAINT "EventTransaction_eventBudgetId_fkey" FOREIGN KEY ("eventBudgetId") REFERENCES "EventBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTransaction" ADD CONSTRAINT "EventTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventTransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTransaction" ADD CONSTRAINT "EventTransaction_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTransactionCategory" ADD CONSTRAINT "EventTransactionCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBudgetImport" ADD CONSTRAINT "EventBudgetImport_eventBudgetId_fkey" FOREIGN KEY ("eventBudgetId") REFERENCES "EventBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBudgetImport" ADD CONSTRAINT "EventBudgetImport_importedByMemberId_fkey" FOREIGN KEY ("importedByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
