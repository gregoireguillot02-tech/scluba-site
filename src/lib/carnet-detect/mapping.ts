import type { CarnetLayout } from './layout-schema';

export interface LayoutPick {
  hole: number;
  /** Index dans le tableau de cellules découpées (ordre row-major). */
  cellIndex: number;
}

export interface MapResult {
  picks: LayoutPick[];
  warnings: string[];
}

// Pur : transforme un layout de page détecté en picks (trou → index de cellule),
// en validant contre les vrais numéros de trous du club. L'index row-major
// `row*cols + col` correspond à l'ordre de sortie de sliceGridToFiles(order='row').
export function mapLayoutToHoles(layout: CarnetLayout, validHoles: number[]): MapResult {
  const valid = new Set(validHoles);
  const seen = new Set<number>();
  const seenCells = new Set<number>();
  const picks: LayoutPick[] = [];
  const warnings: string[] = [];
  const cellCount = layout.rows * layout.cols;

  for (const cell of layout.cells) {
    if (cell.hole == null) continue;
    const idx = cell.row * layout.cols + cell.col;
    if (cellCount <= 0 || idx < 0 || idx >= cellCount) {
      warnings.push(`Trou ${cell.hole} : position (${cell.row},${cell.col}) hors grille — ignoré.`);
      continue;
    }
    if (!valid.has(cell.hole)) {
      warnings.push(`Trou ${cell.hole} détecté mais absent du parcours — ignoré.`);
      continue;
    }
    if (seen.has(cell.hole)) {
      warnings.push(`Trou ${cell.hole} détecté plusieurs fois — 1re occurrence gardée.`);
      continue;
    }
    // Bijection cellule→trou : deux cartes lues à la même position grille (même
    // cellIndex) recevraient sinon la MÊME image découpée côté client.
    if (seenCells.has(idx)) {
      warnings.push(`Cellule (${cell.row},${cell.col}) déjà attribuée — trou ${cell.hole} ignoré (1re carte gardée).`);
      continue;
    }
    seen.add(cell.hole);
    seenCells.add(idx);
    picks.push({ hole: cell.hole, cellIndex: idx });
  }
  return { picks, warnings };
}
