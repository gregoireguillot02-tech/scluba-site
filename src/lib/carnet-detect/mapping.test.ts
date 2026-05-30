import { describe, it, expect } from 'vitest';
import { mapLayoutToHoles } from './mapping';

const HOLES_18 = Array.from({ length: 18 }, (_, i) => i + 1);

describe('mapLayoutToHoles', () => {
  it('mappe une page 2×2 pleine en 4 picks ordonnés', () => {
    const layout = { rows: 2, cols: 2, cells: [
      { row: 0, col: 0, hole: 1 }, { row: 0, col: 1, hole: 2 },
      { row: 1, col: 0, hole: 3 }, { row: 1, col: 1, hole: 4 }] };
    const { picks, warnings } = mapLayoutToHoles(layout, HOLES_18);
    expect(picks).toEqual([
      { hole: 1, cellIndex: 0 }, { hole: 2, cellIndex: 1 },
      { hole: 3, cellIndex: 2 }, { hole: 4, cellIndex: 3 }]);
    expect(warnings).toEqual([]);
  });

  it('ignore les cases vides (page partielle 17/18)', () => {
    const layout = { rows: 2, cols: 2, cells: [
      { row: 0, col: 0, hole: 17 }, { row: 0, col: 1, hole: 18 },
      { row: 1, col: 0, hole: null }, { row: 1, col: 1, hole: null }] };
    const { picks, warnings } = mapLayoutToHoles(layout, HOLES_18);
    expect(picks).toEqual([{ hole: 17, cellIndex: 0 }, { hole: 18, cellIndex: 1 }]);
    expect(warnings).toEqual([]);
  });

  it('écarte un trou absent du parcours avec un warning', () => {
    const layout = { rows: 1, cols: 1, cells: [{ row: 0, col: 0, hole: 27 }] };
    const { picks, warnings } = mapLayoutToHoles(layout, HOLES_18);
    expect(picks).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('27');
  });

  it('garde la 1re occurrence d\'un trou en double', () => {
    const layout = { rows: 1, cols: 2, cells: [
      { row: 0, col: 0, hole: 5 }, { row: 0, col: 1, hole: 5 }] };
    const { picks, warnings } = mapLayoutToHoles(layout, HOLES_18);
    expect(picks).toEqual([{ hole: 5, cellIndex: 0 }]);
    expect(warnings).toHaveLength(1);
  });

  it('écarte une position hors grille', () => {
    const layout = { rows: 1, cols: 1, cells: [{ row: 3, col: 3, hole: 3 }] };
    const { picks, warnings } = mapLayoutToHoles(layout, HOLES_18);
    expect(picks).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('renvoie vide sur un layout vide (détection échouée)', () => {
    const { picks, warnings } = mapLayoutToHoles({ rows: 0, cols: 0, cells: [] }, HOLES_18);
    expect(picks).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
