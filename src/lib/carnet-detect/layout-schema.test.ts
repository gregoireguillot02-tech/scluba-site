import { describe, it, expect } from 'vitest';
import { parseLayoutToolInput, EMPTY_LAYOUT } from './layout-schema';

describe('parseLayoutToolInput', () => {
  it('accepte une grille 2×2 pleine', () => {
    const raw = { rows: 2, cols: 2, cells: [
      { row: 0, col: 0, hole: 1 }, { row: 0, col: 1, hole: 2 },
      { row: 1, col: 0, hole: 3 }, { row: 1, col: 1, hole: 4 }] };
    expect(parseLayoutToolInput(raw)).toEqual(raw);
  });

  it('préserve les cases vides (hole null)', () => {
    const raw = { rows: 2, cols: 2, cells: [
      { row: 0, col: 0, hole: 17 }, { row: 0, col: 1, hole: 18 },
      { row: 1, col: 0, hole: null }, { row: 1, col: 1, hole: null }] };
    expect(parseLayoutToolInput(raw).cells[2].hole).toBeNull();
  });

  it('traite un hole manquant comme null', () => {
    const raw = { rows: 1, cols: 1, cells: [{ row: 0, col: 0 }] };
    expect(parseLayoutToolInput(raw).cells[0].hole).toBeNull();
  });

  it('retombe sur EMPTY_LAYOUT si rows manque', () => {
    expect(parseLayoutToolInput({ cols: 2, cells: [] })).toEqual(EMPTY_LAYOUT);
  });

  it('retombe sur EMPTY_LAYOUT si un hole est hors borne', () => {
    const raw = { rows: 1, cols: 1, cells: [{ row: 0, col: 0, hole: 99 }] };
    expect(parseLayoutToolInput(raw)).toEqual(EMPTY_LAYOUT);
  });

  it('retombe sur EMPTY_LAYOUT si un hole vaut 0 (borne basse)', () => {
    const raw = { rows: 1, cols: 1, cells: [{ row: 0, col: 0, hole: 0 }] };
    expect(parseLayoutToolInput(raw)).toEqual(EMPTY_LAYOUT);
  });
});
