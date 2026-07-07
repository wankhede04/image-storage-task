import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { VariantType } from '@prisma/client';
import { generateVariants } from './variants';

async function makeNoiseJpegFixture(width: number, height: number): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = Math.floor(Math.random() * 256);
  }
  return sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

describe('generateVariants', () => {
  it('produces exactly one variant per VariantType for a large image', async () => {
    const input = await makeNoiseJpegFixture(1600, 1200);
    const variants = await generateVariants(input);

    expect(variants).toHaveLength(3);
    const types = variants.map((v) => v.type).sort();
    expect(types).toEqual([VariantType.FULL, VariantType.THUMBNAIL, VariantType.WEB].sort());
  });

  it('downsizes THUMBNAIL and WEB, keeps FULL at source resolution for a large image', async () => {
    const input = await makeNoiseJpegFixture(1600, 1200);
    const variants = await generateVariants(input);

    const thumbnail = variants.find((v) => v.type === VariantType.THUMBNAIL)!;
    const web = variants.find((v) => v.type === VariantType.WEB)!;
    const full = variants.find((v) => v.type === VariantType.FULL)!;

    expect(Math.max(thumbnail.width, thumbnail.height)).toBeLessThanOrEqual(256);
    expect(Math.max(web.width, web.height)).toBeLessThanOrEqual(1280);
    expect(full.width).toBe(1600);
    expect(full.height).toBe(1200);

    for (const variant of variants) {
      expect(variant.format).toBe('jpeg');
      expect(variant.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('does not upscale WEB/FULL for a small image; THUMBNAIL still bounded', async () => {
    const input = await makeNoiseJpegFixture(300, 300);
    const variants = await generateVariants(input);

    const thumbnail = variants.find((v) => v.type === VariantType.THUMBNAIL)!;
    const web = variants.find((v) => v.type === VariantType.WEB)!;
    const full = variants.find((v) => v.type === VariantType.FULL)!;

    expect(web.width).toBe(300);
    expect(web.height).toBe(300);
    expect(full.width).toBe(300);
    expect(full.height).toBe(300);
    expect(Math.max(thumbnail.width, thumbnail.height)).toBeLessThanOrEqual(256);
  });
});
