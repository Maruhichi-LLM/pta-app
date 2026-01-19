-- AlterTable
ALTER TABLE "Member"
ADD COLUMN     "email" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");
