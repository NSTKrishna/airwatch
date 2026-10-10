-- CreateEnum
CREATE TYPE "RepresentativeRole" AS ENUM ('CORPORATOR', 'MLA', 'MP');

-- AlterEnum
ALTER TYPE "ComplaintEventType" ADD VALUE 'VISIBILITY_CHANGED';

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "hiddenReason" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "publicHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wardId" TEXT;

-- AlterTable
ALTER TABLE "Locality" ADD COLUMN     "wardId" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areas" TEXT,
    "note" TEXT,
    "pilot" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "officeAddress" TEXT,
    "officePhone" TEXT,
    "officeEmail" TEXT,
    "officeLatitude" DOUBLE PRECISION,
    "officeLongitude" DOUBLE PRECISION,
    "sourceUrls" JSONB,
    "verifiedOn" TIMESTAMP(3),

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Representative" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "role" "RepresentativeRole" NOT NULL,
    "name" TEXT NOT NULL,
    "party" TEXT,
    "constituency" TEXT NOT NULL,
    "note" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "verifiedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Representative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "developer" TEXT,
    "category" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "registrationNo" TEXT,
    "description" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coordinateSource" TEXT,
    "coordinatePrecision" TEXT,
    "wardId" TEXT NOT NULL,
    "proposedCompletion" TEXT,
    "status" TEXT,
    "statusConfidence" TEXT,
    "sourceUrls" JSONB NOT NULL,
    "verifiedOn" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ward_code_key" ON "Ward"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ward_slug_key" ON "Ward"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_wardId_role_constituency_key" ON "Representative"("wardId", "role", "constituency");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_wardId_idx" ON "Project"("wardId");

-- CreateIndex
CREATE INDEX "Complaint_wardId_status_idx" ON "Complaint"("wardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Site_projectId_key" ON "Site"("projectId");

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

