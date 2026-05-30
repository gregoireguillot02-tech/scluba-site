import { z } from 'zod';

export interface CarnetCell {
  row: number;
  col: number;
  hole: number | null;
}

export interface CarnetLayout {
  rows: number;
  cols: number;
  cells: CarnetCell[];
}

// Sentinelle "détection échouée / rien d'exploitable sur cette page". Le client
// la traite comme une page à placer à la main (pas d'erreur bloquante).
// Objet gelé : parseLayoutToolInput renvoie ce singleton par référence sur
// échec — le freeze évite qu'un consommateur réassigne ses champs par mégarde.
export const EMPTY_LAYOUT: CarnetLayout = Object.freeze({ rows: 0, cols: 0, cells: [] });

const CellSchema = z.object({
  // row/col 0-indexés : leur max (5) doit rester cohérent avec le max de
  // rows/cols (6) ci-dessous.
  row: z.number().int().min(0).max(5),
  col: z.number().int().min(0).max(5),
  // hole : Claude omet parfois un champ nullable → on traite undefined comme
  // null. Borne haute 36 = plafond de numéro de trou du projet (cf.
  // MAX_HOLE_NUMBER dans api/ops/clubs/[id]/upload.ts).
  hole: z.preprocess((v) => v ?? null, z.number().int().min(1).max(36).nullable()),
});

const LayoutSchema = z.object({
  rows: z.number().int().min(1).max(6),
  cols: z.number().int().min(1).max(6),
  // Pas de contrôle croisé rows×cols == cells.length ici : c'est l'appelant
  // (mapping.ts) qui valide chaque index de cellule contre rows×cols.
  cells: z.array(CellSchema).max(36),
});

// Valide la sortie de l'outil `report_layout`. Sur toute violation, renvoie la
// sentinelle vide plutôt que de jeter — une page mal lue ne doit pas faire
// échouer tout l'import ; l'admin place cette page à la main.
export function parseLayoutToolInput(raw: unknown): CarnetLayout {
  const parsed = LayoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_LAYOUT;
}
