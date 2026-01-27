-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'APPROVED', 'REJECTED');

-- CreateTable: ApprovalRoute
CREATE TABLE "ApprovalRoute" (
    "id" SERIAL PRIMARY KEY,
    "groupId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

ALTER TABLE "ApprovalRoute"
  ADD CONSTRAINT "ApprovalRoute_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ApprovalStep
CREATE TABLE "ApprovalStep" (
    "id" SERIAL PRIMARY KEY,
    "routeId" INTEGER NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverRole" TEXT NOT NULL,
    "requireAll" BOOLEAN NOT NULL DEFAULT TRUE,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

ALTER TABLE "ApprovalStep"
  ADD CONSTRAINT "ApprovalStep_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ApprovalRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ApprovalTemplate
CREATE TABLE "ApprovalTemplate" (
    "id" SERIAL PRIMARY KEY,
    "groupId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "routeId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

ALTER TABLE "ApprovalTemplate"
  ADD CONSTRAINT "ApprovalTemplate_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTemplate"
  ADD CONSTRAINT "ApprovalTemplate_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ApprovalRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ApprovalApplication
CREATE TABLE "ApprovalApplication" (
    "id" SERIAL PRIMARY KEY,
    "groupId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "applicantId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

ALTER TABLE "ApprovalApplication"
  ADD CONSTRAINT "ApprovalApplication_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalApplication"
  ADD CONSTRAINT "ApprovalApplication_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ApprovalTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalApplication"
  ADD CONSTRAINT "ApprovalApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ApprovalAssignment
CREATE TABLE "ApprovalAssignment" (
    "id" SERIAL PRIMARY KEY,
    "applicationId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverRole" TEXT NOT NULL,
    "assignedToId" INTEGER,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "actedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX "ApprovalAssignment_applicationId_stepOrder_idx"
  ON "ApprovalAssignment"("applicationId", "stepOrder");

ALTER TABLE "ApprovalAssignment"
  ADD CONSTRAINT "ApprovalAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ApprovalApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment"
  ADD CONSTRAINT "ApprovalAssignment_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ApprovalStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalAssignment"
  ADD CONSTRAINT "ApprovalAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Trigger to keep updatedAt columns current
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_on_approval_route
BEFORE UPDATE ON "ApprovalRoute"
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER set_timestamp_on_approval_step
BEFORE UPDATE ON "ApprovalStep"
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER set_timestamp_on_approval_template
BEFORE UPDATE ON "ApprovalTemplate"
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER set_timestamp_on_approval_application
BEFORE UPDATE ON "ApprovalApplication"
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER set_timestamp_on_approval_assignment
BEFORE UPDATE ON "ApprovalAssignment"
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();
