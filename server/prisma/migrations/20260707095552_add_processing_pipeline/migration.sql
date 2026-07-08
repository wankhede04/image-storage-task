-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'CONVERTING', 'COMPRESSING', 'GENERATING_VARIANTS', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "VariantType" AS ENUM ('THUMBNAIL', 'WEB', 'FULL');

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "s3KeyOriginal" TEXT NOT NULL,
    "s3KeyConverted" TEXT,
    "format" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "ImageStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReasons" TEXT[],
    "phash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "pipelineError" TEXT,
    "s3KeyNormalized" TEXT,
    "normalizedSizeBytes" INTEGER,
    "s3KeyCompressed" TEXT,
    "compressedSizeBytes" INTEGER,
    "compressionRatio" DOUBLE PRECISION,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageVariant" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "type" "VariantType" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Image_s3KeyOriginal_key" ON "Image"("s3KeyOriginal");

-- CreateIndex
CREATE INDEX "Image_status_idx" ON "Image"("status");

-- CreateIndex
CREATE INDEX "Image_phash_idx" ON "Image"("phash");

-- CreateIndex
CREATE INDEX "Image_pipelineStatus_idx" ON "Image"("pipelineStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ImageVariant_imageId_type_key" ON "ImageVariant"("imageId", "type");

-- AddForeignKey
ALTER TABLE "ImageVariant" ADD CONSTRAINT "ImageVariant_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
