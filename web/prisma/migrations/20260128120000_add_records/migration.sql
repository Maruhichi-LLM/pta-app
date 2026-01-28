-- Create enum for record source types
CREATE TYPE "RecordSourceType" AS ENUM ('CHAT', 'TODO', 'EVENT');

-- Create Record table
CREATE TABLE "Record" (
  "id" SERIAL PRIMARY KEY,
  "groupId" INTEGER NOT NULL,
  "eventId" INTEGER,
  "sourceType" "RecordSourceType" NOT NULL,
  "sourceId" INTEGER,
  "caption" VARCHAR(255),
  "recordDate" TIMESTAMP(3) NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "createdByMemberId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Record_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Record_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Record_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create RecordPhoto table
CREATE TABLE "RecordPhoto" (
  "id" SERIAL PRIMARY KEY,
  "recordId" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordPhoto_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Record_groupId_fiscalYear_idx" ON "Record"("groupId", "fiscalYear");
CREATE INDEX "Record_eventId_idx" ON "Record"("eventId");
CREATE INDEX "RecordPhoto_recordId_idx" ON "RecordPhoto"("recordId");
