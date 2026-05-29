import { describe, it, expect } from 'vitest';
import { computeIconLayout } from './club-icon';

describe('computeIconLayout', () => {
  const SIZE = 512;
  const PAD = 0.1;
  const safe = SIZE * (1 - 2 * PAD); // 409.6

  it('centre un logo carré dans la zone sûre', () => {
    const { drawW, drawH, dx, dy } = computeIconLayout(100, 100, SIZE, PAD);
    expect(drawW).toBeCloseTo(safe);
    expect(drawH).toBeCloseTo(safe);
    expect(dx).toBeCloseTo((SIZE - safe) / 2);
    expect(dy).toBeCloseTo((SIZE - safe) / 2);
  });

  it('contient un logo large sans déborder + centre verticalement', () => {
    const { drawW, drawH, dx, dy } = computeIconLayout(200, 100, SIZE, PAD);
    expect(drawW).toBeCloseTo(safe); // limité par la largeur
    expect(drawH).toBeCloseTo(safe / 2); // 204.8
    expect(dx).toBeCloseTo((SIZE - drawW) / 2);
    expect(dy).toBeCloseTo((SIZE - drawH) / 2);
    expect(drawW).toBeLessThanOrEqual(safe + 0.01);
    expect(drawH).toBeLessThanOrEqual(safe + 0.01);
  });

  it('contient un logo haut sans déborder + centre horizontalement', () => {
    const { drawW, drawH, dx, dy } = computeIconLayout(100, 200, SIZE, PAD);
    expect(drawH).toBeCloseTo(safe);
    expect(drawW).toBeCloseTo(safe / 2);
    expect(dx).toBeCloseTo((SIZE - drawW) / 2);
    expect(dy).toBeCloseTo((SIZE - drawH) / 2);
  });

  it('reste centré (dx*2 + drawW == size)', () => {
    const { drawW, dx } = computeIconLayout(640, 120, SIZE, PAD);
    expect(dx * 2 + drawW).toBeCloseTo(SIZE);
  });
});
