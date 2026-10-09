-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CITIZEN', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('EVALUATED', 'INPUT_REJECTED', 'MODEL_UNAVAILABLE', 'MODEL_ERROR');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('CITIZEN_PHOTO', 'INSPECTION_EVIDENCE');

-- CreateEnum
CREATE TYPE "ComplaintEventType" AS ENUM ('SUBMITTED', 'STATUS_CHANGED', 'OFFICER_ASSIGNED', 'NOTE_ADDED', 'EVIDENCE_UPLOADED', 'FINDINGS_UPDATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CITIZEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "localityId" TEXT NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "localityId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "distanceToBackgroundM" DOUBLE PRECISION NOT NULL,
    "siteBearingDeg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorObservation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "pollutant" TEXT NOT NULL,
    "averaging" TEXT NOT NULL,
    "backgroundSensorId" TEXT NOT NULL,
    "backgroundValue" DOUBLE PRECISION NOT NULL,
    "backgroundUnit" TEXT NOT NULL,
    "backgroundTimestamp" TIMESTAMP(3) NOT NULL,
    "siteSensorId" TEXT NOT NULL,
    "siteValue" DOUBLE PRECISION NOT NULL,
    "siteUnit" TEXT NOT NULL,
    "siteTimestamp" TIMESTAMP(3) NOT NULL,
    "backgroundUgm3" DOUBLE PRECISION,
    "siteUgm3" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "humidityPct" DOUBLE PRECISION,
    "windSpeedMs" DOUBLE PRECISION,
    "windDirectionDeg" DOUBLE PRECISION,
    "windConvention" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyEvaluation" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL,
    "reason" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "backgroundValue" DOUBLE PRECISION,
    "siteValue" DOUBLE PRECISION,
    "unit" TEXT,
    "measurementType" TEXT,
    "scaleId" TEXT,
    "backgroundTimestamp" TIMESTAMP(3),
    "siteTimestamp" TIMESTAMP(3),
    "features" JSONB,
    "observedDifference" DOUBLE PRECISION,
    "expectedNormalDifference" DOUBLE PRECISION,
    "calibratedMargin" DOUBLE PRECISION,
    "dynamicBarrier" DOUBLE PRECISION,
    "isAnomaly" BOOLEAN,
    "interpretation" TEXT,
    "modelVersion" TEXT,
    "modelAlgorithm" TEXT,
    "modelDataSource" TEXT,
    "modelSyntheticOnly" BOOLEAN,

    CONSTRAINT "AnomalyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "citizenId" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "siteId" TEXT,
    "description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationText" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'SUBMITTED',
    "anomalyEvaluationId" TEXT,
    "sensorSnapshot" JSONB,
    "assignedOfficerId" TEXT,
    "findings" TEXT,
    "correctiveAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ComplaintEventType" NOT NULL,
    "fromStatus" "ComplaintStatus",
    "toStatus" "ComplaintStatus",
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatorState" (
    "siteId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL DEFAULT 'NORMAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulatorState_pkey" PRIMARY KEY ("siteId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Locality_code_key" ON "Locality"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE INDEX "SensorObservation_siteId_receivedAt_idx" ON "SensorObservation"("siteId", "receivedAt");

-- CreateIndex
CREATE INDEX "SensorObservation_receivedAt_idx" ON "SensorObservation"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnomalyEvaluation_observationId_key" ON "AnomalyEvaluation"("observationId");

-- CreateIndex
CREATE INDEX "AnomalyEvaluation_siteId_evaluatedAt_idx" ON "AnomalyEvaluation"("siteId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "AnomalyEvaluation_evaluatedAt_idx" ON "AnomalyEvaluation"("evaluatedAt");

-- CreateIndex
CREATE INDEX "AnomalyEvaluation_isAnomaly_evaluatedAt_idx" ON "AnomalyEvaluation"("isAnomaly", "evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_seq_key" ON "Complaint"("seq");

-- CreateIndex
CREATE INDEX "Complaint_citizenId_createdAt_idx" ON "Complaint"("citizenId", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_localityId_idx" ON "Complaint"("localityId");

-- CreateIndex
CREATE INDEX "Complaint_siteId_idx" ON "Complaint"("siteId");

-- CreateIndex
CREATE INDEX "Attachment_complaintId_idx" ON "Attachment"("complaintId");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaintId_createdAt_idx" ON "ComplaintEvent"("complaintId", "createdAt");

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorObservation" ADD CONSTRAINT "SensorObservation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyEvaluation" ADD CONSTRAINT "AnomalyEvaluation_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "SensorObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyEvaluation" ADD CONSTRAINT "AnomalyEvaluation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_anomalyEvaluationId_fkey" FOREIGN KEY ("anomalyEvaluationId") REFERENCES "AnomalyEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatorState" ADD CONSTRAINT "SimulatorState_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
