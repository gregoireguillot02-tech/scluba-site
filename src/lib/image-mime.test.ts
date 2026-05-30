import { describe, it, expect } from 'vitest';
import { detectImageMime } from './image-mime';

describe('detectImageMime', () => {
  it('reconnaît un PNG par sa signature', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]);
    expect(detectImageMime(png)).toBe('image/png');
  });

  it('reconnaît un JPEG par sa signature', () => {
    const jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0]);
    expect(detectImageMime(jpg)).toBe('image/jpeg');
  });

  it('reconnaît un WebP (RIFF....WEBP)', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageMime(webp)).toBe('image/webp');
  });

  it('renvoie null sur des octets inconnus', () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});
