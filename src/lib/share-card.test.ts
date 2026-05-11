import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressPhoto } from './share-card';

// Stub createImageBitmap + HTMLCanvasElement.toBlob in jsdom
beforeEach(() => {
  // @ts-expect-error jsdom n'a pas createImageBitmap
  globalThis.createImageBitmap = vi.fn(async (_file: Blob) => ({
    width: 4000,
    height: 3000,
    close: () => {},
  } as unknown as ImageBitmap));

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(['fake-jpeg-bytes'.repeat(1000)], { type: 'image/jpeg' }));
  } as typeof HTMLCanvasElement.prototype.toBlob;
});

describe('compressPhoto', () => {
  it('returns a JPEG blob', async () => {
    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' });
    const blob = await compressPhoto(file);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('downsizes a 4000x3000 photo to fit 1080x1350 cover (4:5)', async () => {
    const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' });
    let canvasWidth = 0;
    let canvasHeight = 0;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'canvas') {
        Object.defineProperty(el, 'width', {
          set(v) { canvasWidth = v; },
          get() { return canvasWidth; },
        });
        Object.defineProperty(el, 'height', {
          set(v) { canvasHeight = v; },
          get() { return canvasHeight; },
        });
      }
      return el;
    });
    await compressPhoto(file);
    expect(canvasWidth).toBe(1080);
    expect(canvasHeight).toBe(1350);
  });
});
