import '../config'; // ensure .env is loaded before the shared prisma client is constructed
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createId } from '@paralleldrive/cuid2';
import { VariantType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { storageService } from '../services/storage';
import { processVariantJob } from './variantWorker';

describe('processVariantJob (integration)', () => {
  const imageId = createId();
  const s3KeyOriginal = `images/${imageId}/original.jpg`;
  const s3KeyCompressed = `images/${imageId}/compressed.jpg`;

  beforeAll(async () => {
    const jpeg = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    await storageService.putObject(s3KeyCompressed, jpeg, 'image/jpeg');

    await prisma.image.create({
      data: {
        id: imageId,
        originalName: 'test.jpg',
        s3KeyOriginal,
        format: 'jpeg',
        fileSizeBytes: jpeg.length,
        s3KeyCompressed,
      },
    });
  });

  afterAll(async () => {
    await prisma.image.delete({ where: { id: imageId } });
    await storageService.deletePrefix(`images/${imageId}/`);
  });

  it('generates exactly 3 variants and marks the image COMPLETE, then is a no-op on rerun', async () => {
    await processVariantJob(imageId);

    const variantsAfterFirstRun = await prisma.imageVariant.findMany({ where: { imageId } });
    expect(variantsAfterFirstRun).toHaveLength(3);
    const types = variantsAfterFirstRun.map((v) => v.type).sort();
    expect(types).toEqual([VariantType.FULL, VariantType.THUMBNAIL, VariantType.WEB].sort());

    const imageAfterFirstRun = await prisma.image.findUnique({ where: { id: imageId } });
    expect(imageAfterFirstRun?.pipelineStatus).toBe('COMPLETE');

    const snapshot = variantsAfterFirstRun
      .map((v) => ({ id: v.id, type: v.type, s3Key: v.s3Key }))
      .sort((a, b) => a.type.localeCompare(b.type));

    // Second run — idempotency guard should make this a no-op.
    await processVariantJob(imageId);

    const variantsAfterSecondRun = await prisma.imageVariant.findMany({ where: { imageId } });
    expect(variantsAfterSecondRun).toHaveLength(3);

    const snapshotAfterSecondRun = variantsAfterSecondRun
      .map((v) => ({ id: v.id, type: v.type, s3Key: v.s3Key }))
      .sort((a, b) => a.type.localeCompare(b.type));

    expect(snapshotAfterSecondRun).toEqual(snapshot);

    const imageAfterSecondRun = await prisma.image.findUnique({ where: { id: imageId } });
    expect(imageAfterSecondRun?.pipelineStatus).toBe('COMPLETE');
  });
});
