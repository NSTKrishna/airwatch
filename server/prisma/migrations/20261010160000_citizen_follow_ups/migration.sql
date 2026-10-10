-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('OFFICIAL_COMPLAINT', 'OFFICIAL_RESPONSE', 'STILL_UNRESOLVED', 'IMPROVEMENT_OBSERVED', 'DISPUTE_CLOSURE', 'NOTE');

-- CreateEnum
CREATE TYPE "EvidenceCheck" AS ENUM ('UNCHECKED', 'VERIFIED', 'SET_ASIDE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentKind" ADD VALUE 'FOLLOW_UP_PHOTO';
ALTER TYPE "AttachmentKind" ADD VALUE 'OFFICIAL_ACKNOWLEDGMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplaintEventType" ADD VALUE 'FOLLOW_UP_ADDED';
ALTER TYPE "ComplaintEventType" ADD VALUE 'FOLLOW_UP_CHECKED';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "followUpId" TEXT;

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "FollowUpKind" NOT NULL,
    "note" TEXT,
    "occurredOn" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "officialChannel" TEXT,
    "officialReference" TEXT,
    "check" "EvidenceCheck" NOT NULL DEFAULT 'UNCHECKED',
    "checkNote" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUp_complaintId_createdAt_idx" ON "FollowUp"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUp_check_idx" ON "FollowUp"("check");

-- CreateIndex
CREATE INDEX "Attachment_followUpId_idx" ON "Attachment"("followUpId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

