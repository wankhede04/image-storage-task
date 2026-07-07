import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { fromBuffer } from 'file-type';
import { normalizeToJpeg } from './conversion';

async function makePngFixture(width: number, height: number): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = Math.floor(Math.random() * 256);
  }
  return sharp(noise, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('normalizeToJpeg', () => {
  it('converts a PNG input into a JPEG buffer', async () => {
    const png = await makePngFixture(64, 48);
    const result = await normalizeToJpeg(png);
    const detected = await fromBuffer(result.buffer);
    expect(detected?.mime).toBe('image/jpeg');
  });

  it('preserves width/height from the source', async () => {
    const png = await makePngFixture(64, 48);
    const result = await normalizeToJpeg(png);
    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
  });

  it('reports format jpeg', async () => {
    const png = await makePngFixture(64, 48);
    const result = await normalizeToJpeg(png);
    expect(result.format).toBe('jpeg');
  });
});
