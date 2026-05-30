import { filesToCandidates } from '../carnet-split';
import { sliceGridToFiles } from '../carnet-crop';
import { mapLayoutToHoles } from './mapping';
import type { CarnetLayout } from './layout-schema';

export interface HoleAssignment {
  hole: number;
  file: File;
}

export interface DetectResult {
  assignments: HoleAssignment[];
  warnings: string[];
}

async function detectPageLayout(clubId: string, expectedHoles: number[], pageJpeg: File): Promise<CarnetLayout> {
  const fd = new FormData();
  fd.append('file', pageJpeg);
  fd.append('expectedHoles', JSON.stringify(expectedHoles));
  const res = await fetch(`/api/ops/clubs/${clubId}/carnet-detect`, { method: 'POST', body: fd });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Détection HTTP ${res.status}`);
  }
  return json.layout as CarnetLayout;
}

// Rend chaque page PDF / image en candidat, demande à l'IA la grille + les
// numéros, découpe chaque page et mappe les cellules aux trous. Renvoie un
// fichier recadré par trou détecté + la liste des avertissements.
export async function filesToHoleAssignments(
  files: File[],
  clubId: string,
  validHoles: number[],
  onProgress?: (msg: string) => void,
): Promise<DetectResult> {
  const candidates = await filesToCandidates(files); // 1 entrée par page PDF / image
  // filesToCandidates ignore silencieusement les types non gérés : si rien n'est
  // exploitable, on le signale plutôt que de renvoyer un no-op muet.
  if (candidates.length === 0) {
    return { assignments: [], warnings: ['Aucun fichier exploitable (dépose un PDF ou des images).'] };
  }
  const assignments: HoleAssignment[] = [];
  const warnings: string[] = [];
  const taken = new Set<number>();

  for (let p = 0; p < candidates.length; p++) {
    onProgress?.(`Détection page ${p + 1}/${candidates.length}…`);
    let layout: CarnetLayout;
    try {
      layout = await detectPageLayout(clubId, validHoles, candidates[p].file);
    } catch (e) {
      warnings.push(`Page ${p + 1} : détection échouée (${(e as Error).message}) — place ces trous à la main.`);
      continue;
    }
    if (layout.rows < 1 || layout.cols < 1 || layout.cells.length === 0) {
      warnings.push(`Page ${p + 1} : aucun trou reconnu — place-la à la main (mode « Image en grille »).`);
      continue;
    }
    let cells: File[];
    try {
      cells = await sliceGridToFiles(candidates[p].file, layout.cols, layout.rows, 'row');
    } catch (e) {
      // Un échec de découpe (canvas/OOM/HEIC) ne doit pas jeter tout le batch :
      // on préserve les pages déjà détectées et on signale celle-ci.
      warnings.push(`Page ${p + 1} : découpe échouée (${(e as Error).message}) — place ces trous à la main.`);
      continue;
    }
    const { picks, warnings: w } = mapLayoutToHoles(layout, validHoles);
    warnings.push(...w);
    for (const pick of picks) {
      if (taken.has(pick.hole)) {
        warnings.push(`Trou ${pick.hole} déjà détecté sur une page précédente — ignoré.`);
        continue;
      }
      const file = cells[pick.cellIndex];
      if (!file) {
        warnings.push(`Trou ${pick.hole} : cellule introuvable après découpe — ignoré.`);
        continue;
      }
      taken.add(pick.hole);
      assignments.push({ hole: pick.hole, file });
    }
  }
  return { assignments, warnings };
}
