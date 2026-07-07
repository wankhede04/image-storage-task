import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { compress } from './compression';

async function makeNoiseJpegFixture(width: number, height: number): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = Math.floor(Math.random() * 256);
  }
  return sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

describe('compress', () => {
  it('shrinks a high-entropy jpeg when compressed at a lower quality', async () => {
    const input = await makeNoiseJpegFixture(400, 400);
    const result = await compress(input, 50);

    expect(result.inputSizeBytes).toBe(input.length);
    expect(result.sizeBytes).toBeLessThan(result.inputSizeBytes);
    expect(result.compressionRatio).toBe(result.sizeBytes / result.inputSizeBytes);
    expect(result.compressionRatio).toBeGreaterThan(0);
    expect(result.compressionRatio).toBeLessThan(1);
  });
});
