-- CreateEnum
CREATE TYPE "DataProvenance" AS ENUM ('SIMULATED', 'DEVICE', 'REFERENCE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ReadingQuality" AS ENUM ('VALID', 'INVALID');

-- AlterTable
ALTER TABLE "AnomalyEvaluation" ADD COLUMN     "domainWarnings" JSONB;

-- AlterTable
ALTER TABLE "Locality" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "city" TEXT NOT NULL DEFAULT 'Delhi';

-- AlterTable
ALTER TABLE "SensorObservation" ADD COLUMN     "backgroundObservationId" TEXT,
ADD COLUMN     "backgroundSource" TEXT,
ADD COLUMN     "deviceReadingId" TEXT,
ADD COLUMN     "intervalSeconds" INTEGER,
ADD COLUMN     "pairing" JSONB,
ADD COLUMN     "sitePm25Ugm3" DOUBLE PRECISION,
ADD COLUMN     "weatherObservationId" TEXT,
ADD COLUMN     "weatherSource" TEXT,
ALTER COLUMN "backgroundSensorId" DROP NOT NULL,
ALTER COLUMN "backgroundValue" DROP NOT NULL,
ALTER COLUMN "backgroundUnit" DROP NOT NULL,
ALTER COLUMN "backgroundTimestamp" DROP NOT NULL,
ALTER COLUMN "siteValue" DROP NOT NULL,
ALTER COLUMN "siteUnit" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "operator" TEXT,
ADD COLUMN     "provenance" "DataProvenance" NOT NULL DEFAULT 'SIMULATED';

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "provenance" "DataProvenance" NOT NULL,
    "samplingIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishAllowed" BOOLEAN NOT NULL DEFAULT false,
    "calibratedAt" TIMESTAMP(3),
    "calibrationNote" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "lastReportedStatus" TEXT,
    "registeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionBatch" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "rejections" JSONB,

    CONSTRAINT "IngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceReading" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "batchId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "intervalSeconds" INTEGER NOT NULL,
    "pm25" DOUBLE PRECISION,
    "pm10" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "humidityPct" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "pm25Ugm3" DOUBLE PRECISION,
    "pm10Ugm3" DOUBLE PRECISION,
    "reportedStatus" TEXT,
    "provenance" "DataProvenance" NOT NULL,
    "quality" "ReadingQuality" NOT NULL,
    "qualityReason" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundObservation" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "intervalSeconds" INTEGER NOT NULL,
    "pm10" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "pm10Ugm3" DOUBLE PRECISION,
    "provenance" "DataProvenance" NOT NULL,
    "source" TEXT NOT NULL,
    "instrument" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherObservation" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "windSpeedMs" DOUBLE PRECISION,
    "windDirectionDeg" DOUBLE PRECISION,
    "windConvention" TEXT,
    "provenance" "DataProvenance" NOT NULL,
    "source" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "Device_siteId_idx" ON "Device"("siteId");

-- CreateIndex
CREATE INDEX "IngestionBatch_deviceId_receivedAt_idx" ON "IngestionBatch"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "DeviceReading_siteId_observedAt_idx" ON "DeviceReading"("siteId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceReading_deviceId_observedAt_intervalSeconds_key" ON "DeviceReading"("deviceId", "observedAt", "intervalSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundObservation_stationId_observedAt_intervalSeconds_key" ON "BackgroundObservation"("stationId", "observedAt", "intervalSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherObservation_stationId_observedAt_key" ON "WeatherObservation"("stationId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SensorObservation_deviceReadingId_key" ON "SensorObservation"("deviceReadingId");

-- CreateIndex
CREATE INDEX "SensorObservation_siteId_siteTimestamp_idx" ON "SensorObservation"("siteId", "siteTimestamp");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceReading" ADD CONSTRAINT "DeviceReading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceReading" ADD CONSTRAINT "DeviceReading_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceReading" ADD CONSTRAINT "DeviceReading_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundObservation" ADD CONSTRAINT "BackgroundObservation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherObservation" ADD CONSTRAINT "WeatherObservation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorObservation" ADD CONSTRAINT "SensorObservation_deviceReadingId_fkey" FOREIGN KEY ("deviceReadingId") REFERENCES "DeviceReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorObservation" ADD CONSTRAINT "SensorObservation_backgroundObservationId_fkey" FOREIGN KEY ("backgroundObservationId") REFERENCES "BackgroundObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorObservation" ADD CONSTRAINT "SensorObservation_weatherObservationId_fkey" FOREIGN KEY ("weatherObservationId") REFERENCES "WeatherObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rows that existed before this migration are the original Delhi prototype localities (labelled above).
-- New localities default to Mumbai.
ALTER TABLE "Locality" ALTER COLUMN "city" SET DEFAULT 'Mumbai';
